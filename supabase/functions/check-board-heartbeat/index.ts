// Scheduled by sql/schedule_board_heartbeat_check.sql (pg_cron, every 5
// minutes). Checks whether the shop beacon board has missed its heartbeat
// (see sendHeartbeat() in shop-beacon-monitor.ino) for too long, and if so,
// emails every admin -- once per outage, not on every check while it stays
// down (see offline_alert_sent in add_board_heartbeat_to_beacon_settings.sql).
//
// Required secrets (set via `supabase secrets set`):
//   RESEND_API_KEY   -- from resend.com
//   ALERT_FROM_EMAIL -- must be on a domain verified with Resend, e.g.
//                       "KYPD Tool Tracker <alerts@yourdomain.com>"
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the platform, no need to set them.

import { createClient } from 'npm:@supabase/supabase-js@2';

const OFFLINE_THRESHOLD_MINUTES = 15;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: settings, error: settingsError } = await supabase
    .from('beacon_settings')
    .select('board_last_seen, offline_alert_sent, offline_alerts_enabled')
    .eq('id', true)
    .single();

  if (settingsError || !settings) {
    return Response.json({ error: settingsError?.message || 'beacon_settings row not found' }, { status: 500 });
  }

  if (!settings.offline_alerts_enabled) {
    return Response.json({ status: 'offline alerts are muted, nothing to check' });
  }

  if (!settings.board_last_seen) {
    return Response.json({ status: 'board has never reported in, nothing to check' });
  }

  const minutesSinceLastSeen = (Date.now() - new Date(settings.board_last_seen).getTime()) / 60000;
  const isStale = minutesSinceLastSeen >= OFFLINE_THRESHOLD_MINUTES;

  if (!isStale || settings.offline_alert_sent) {
    return Response.json({
      status: 'ok',
      minutesSinceLastSeen: Math.round(minutesSinceLastSeen),
      alertSent: false,
    });
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('email')
    .eq('is_admin', true);

  if (adminsError) {
    return Response.json({ error: adminsError.message }, { status: 500 });
  }

  const recipients = (admins || []).map((a) => a.email).filter(Boolean);

  if (recipients.length > 0) {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('ALERT_FROM_EMAIL'),
        to: recipients,
        subject: '⚠ KYPD Tool Tracker: Beacon Tower is offline',
        html: `<p>The Beacon Tower hasn't checked in for over ${OFFLINE_THRESHOLD_MINUTES} minutes ` +
          `(last seen ${new Date(settings.board_last_seen).toLocaleString()}).</p>` +
          `<p>While it's down, the door alarm for Shop tools won't work. Check that it's powered on ` +
          `and connected to WiFi -- if the network changed, use WiFi Settings &rarr; Update WiFi via ` +
          `Bluetooth in the app to reconnect it without needing to reflash.</p>`,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      return Response.json({ error: `Resend send failed: ${resendRes.status} ${body}` }, { status: 502 });
    }
  }

  await supabase.from('beacon_settings').update({ offline_alert_sent: true }).eq('id', true);

  return Response.json({
    status: 'alert sent',
    minutesSinceLastSeen: Math.round(minutesSinceLastSeen),
    alertSent: true,
    recipients: recipients.length,
  });
});
