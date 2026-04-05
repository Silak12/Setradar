"""
push_sender.py — SETRADAR Web Push Sender
==========================================
Sends push notifications to subscribed users based on notification type.

Requirements:
    pip install pywebpush supabase

VAPID Setup (run once):
    npx web-push generate-vapid-keys
    -> copy VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY into your env / config

Usage examples:
    # When a timetable for an event becomes public
    python push_sender.py --type timetable_public --event-id 42

    # When a DJ's timetable slot is published at an event both are followed
    python push_sender.py --type timetable_act_event --act-id 7 --event-id 42

    # When a DJ posts a guestlist story for a followed event
    python push_sender.py --type guestlist_story --act-id 7 --event-id 42

    # New event announced at a followed club
    python push_sender.py --type new_event_club --club-id 3 --event-id 42

    # Day-of reminder for a followed event
    python push_sender.py --type event_day_reminder --event-id 42
"""

import argparse
import json
import os
from supabase import create_client, Client
from pywebpush import webpush, WebPushException

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL     = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')  # Use service role key!
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY  = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_CLAIMS      = {'sub': 'mailto:admin@setradar.de'}

# ── Notification templates ─────────────────────────────────────────────────────

def build_payload(notif_type: str, context: dict) -> dict:
    event_name = context.get('event_name', 'Event')
    act_name   = context.get('act_name', 'DJ')
    club_name  = context.get('club_name', 'Club')
    event_id   = context.get('event_id')

    templates = {
        'timetable_act_event': {
            'title': f'// TIMETABLE — {act_name.upper()}',
            'body':  f'{act_name} spielt bei {event_name}. Zeiten jetzt online.',
            'tag':   f'timetable-act-{context.get("act_id")}-{event_id}',
            'data':  {'url': f'/?event={event_id}'},
        },
        'timetable_event_public': {
            'title': f'// TIMETABLE LIVE — {event_name.upper()}',
            'body':  f'Der Timetable für {event_name} ist jetzt öffentlich.',
            'tag':   f'timetable-event-{event_id}',
            'data':  {'url': f'/?event={event_id}'},
        },
        'guestlist_story': {
            'title': f'// GÄSTELISTE — {act_name.upper()}',
            'body':  f'{act_name} bietet Gästeliste für {event_name} an. Story checken!',
            'tag':   f'guestlist-{context.get("act_id")}-{event_id}',
            'data':  {'url': f'/?event={event_id}'},
        },
        'new_event_club': {
            'title': f'// NEUES EVENT — {club_name.upper()}',
            'body':  f'{club_name} hat {event_name} angekündigt.',
            'tag':   f'new-event-{event_id}',
            'data':  {'url': f'/?event={event_id}'},
        },
        'event_day_reminder': {
            'title': f'// HEUTE — {event_name.upper()}',
            'body':  f'{event_name} findet heute statt. Vergiss es nicht.',
            'tag':   f'reminder-{event_id}',
            'data':  {'url': f'/?event={event_id}'},
        },
    }
    return templates.get(notif_type, {
        'title': 'SETRADAR',
        'body':  'Neue Benachrichtigung',
        'tag':   'setradar-default',
        'data':  {'url': '/'},
    })


# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required')
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_target_user_ids(sb: Client, notif_type: str, context: dict) -> list[str]:
    """
    Returns user_ids that:
      1. Have push subscriptions
      2. Have the relevant notification preference enabled
      3. Follow the relevant entity (act / club / event)
    """
    pref_column_map = {
        'timetable_act_event':    'notify_timetable_act_event',
        'timetable_event_public': 'notify_timetable_event_public',
        'guestlist_story':        'notify_guestlist_story',
        'new_event_club':         'notify_new_event_club',
        'event_day_reminder':     'notify_event_day_reminder',
    }
    pref_col = pref_column_map.get(notif_type)
    if not pref_col:
        return []

    # Users with this pref enabled
    prefs = sb.table('notification_preferences').select('user_id').eq(pref_col, True).execute()
    candidate_ids = {r['user_id'] for r in (prefs.data or [])}
    if not candidate_ids:
        return []

    # Filter by follow: depends on notification type
    event_id = context.get('event_id')
    act_id   = context.get('act_id')
    club_id  = context.get('club_id')

    follow_ids = set()

    if notif_type == 'timetable_act_event' and act_id and event_id:
        # Must follow BOTH the act and the event
        act_follows = sb.table('favorites').select('user_id') \
            .eq('entity_type', 'act').eq('entity_id', str(act_id)).execute()
        event_follows = sb.table('favorites').select('user_id') \
            .eq('entity_type', 'event').eq('entity_id', str(event_id)).execute()
        act_set   = {r['user_id'] for r in (act_follows.data or [])}
        event_set = {r['user_id'] for r in (event_follows.data or [])}
        follow_ids = act_set & event_set

    elif notif_type in ('timetable_event_public', 'event_day_reminder', 'guestlist_story') and event_id:
        follows = sb.table('favorites').select('user_id') \
            .eq('entity_type', 'event').eq('entity_id', str(event_id)).execute()
        follow_ids = {r['user_id'] for r in (follows.data or [])}
        if notif_type == 'guestlist_story' and act_id:
            # Also must follow the DJ
            act_follows = sb.table('favorites').select('user_id') \
                .eq('entity_type', 'act').eq('entity_id', str(act_id)).execute()
            act_set = {r['user_id'] for r in (act_follows.data or [])}
            follow_ids = follow_ids & act_set

    elif notif_type == 'new_event_club' and club_id:
        follows = sb.table('favorites').select('user_id') \
            .eq('entity_type', 'club').eq('entity_id', str(club_id)).execute()
        follow_ids = {r['user_id'] for r in (follows.data or [])}

    return list(candidate_ids & follow_ids)


def get_subscriptions_for_users(sb: Client, user_ids: list[str]) -> list[dict]:
    if not user_ids:
        return []
    subs = sb.table('push_subscriptions').select('user_id, endpoint, p256dh, auth') \
        .in_('user_id', user_ids).execute()
    return subs.data or []


def get_event_name(sb: Client, event_id) -> str:
    if not event_id:
        return 'Event'
    r = sb.table('events').select('event_name').eq('id', event_id).maybe_single().execute()
    return r.data['event_name'] if r.data else 'Event'


def get_act_name(sb: Client, act_id) -> str:
    if not act_id:
        return 'DJ'
    r = sb.table('acts').select('name').eq('id', act_id).maybe_single().execute()
    return r.data['name'] if r.data else 'DJ'


def get_club_name(sb: Client, club_id) -> str:
    if not club_id:
        return 'Club'
    r = sb.table('clubs').select('name').eq('id', club_id).maybe_single().execute()
    return r.data['name'] if r.data else 'Club'


# ── Send ───────────────────────────────────────────────────────────────────────

def send_push(subscription: dict, payload: dict) -> bool:
    try:
        webpush(
            subscription_info={
                'endpoint': subscription['endpoint'],
                'keys': {
                    'p256dh': subscription['p256dh'],
                    'auth':   subscription['auth'],
                },
            },
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS,
        )
        return True
    except WebPushException as e:
        status = e.response.status_code if e.response else 'unknown'
        print(f'  Push failed (status {status}): {e}')
        return False


def run(notif_type: str, event_id=None, act_id=None, club_id=None, dry_run=False):
    if not VAPID_PRIVATE_KEY:
        print('ERROR: VAPID_PRIVATE_KEY not set in environment.')
        return

    sb = get_supabase()

    # Resolve names
    context = {
        'event_id':   event_id,
        'act_id':     act_id,
        'club_id':    club_id,
        'event_name': get_event_name(sb, event_id),
        'act_name':   get_act_name(sb, act_id),
        'club_name':  get_club_name(sb, club_id),
    }

    payload = build_payload(notif_type, context)
    print(f'Notification: [{notif_type}] — "{payload["title"]}" / "{payload["body"]}"')

    user_ids = get_target_user_ids(sb, notif_type, context)
    print(f'Target users: {len(user_ids)}')
    if not user_ids:
        print('No users to notify.')
        return

    subscriptions = get_subscriptions_for_users(sb, user_ids)
    print(f'Subscriptions: {len(subscriptions)}')

    if dry_run:
        print('[dry-run] Would send to:')
        for s in subscriptions:
            print(f'  {s["user_id"][:8]}… → {s["endpoint"][:60]}…')
        return

    sent = failed = 0
    stale_endpoints = []
    for sub in subscriptions:
        ok = send_push(sub, payload)
        if ok:
            sent += 1
        else:
            failed += 1
            stale_endpoints.append(sub['endpoint'])

    # Clean up stale subscriptions (410 Gone)
    if stale_endpoints:
        sb.table('push_subscriptions').delete().in_('endpoint', stale_endpoints).execute()
        print(f'Removed {len(stale_endpoints)} stale subscriptions')

    print(f'Done: {sent} sent, {failed} failed')


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SETRADAR Push Sender')
    parser.add_argument('--type', required=True,
        choices=['timetable_act_event', 'timetable_event_public', 'guestlist_story',
                 'new_event_club', 'event_day_reminder'],
        help='Notification type')
    parser.add_argument('--event-id', type=int, default=None)
    parser.add_argument('--act-id',   type=int, default=None)
    parser.add_argument('--club-id',  type=int, default=None)
    parser.add_argument('--dry-run',  action='store_true', help='Simulate without sending')
    args = parser.parse_args()

    run(
        notif_type=args.type,
        event_id=args.event_id,
        act_id=args.act_id,
        club_id=args.club_id,
        dry_run=args.dry_run,
    )
