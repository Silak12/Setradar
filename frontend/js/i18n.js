/**
 * i18n.js — Setradar translation engine
 * Load this FIRST, before all other scripts.
 * Usage in JS:  t('key')  or  t('key', { param: value })
 * Usage in HTML: <span data-i18n="key"></span>
 *               <input data-i18n-placeholder="key">
 */
(function () {

  const TRANSLATIONS = {
    en: {
      // Nav
      'nav.guest':        'Guest',
      'nav.login':        'Login',
      'nav.logout':       'Logout',
      'nav.city_select':  'Select city',
      'nav.search_city':  'Search city',

      // Footer
      'footer.impressum': 'Imprint',
      'footer.privacy':   'Privacy',
      'footer.terms':     'Terms',
      'common.close':     'Close',
      'common.previous':  'Previous',
      'common.next':      'Next',
      'common.saved':     'Saved.',
      'common.loading':   'Loading...',
      'common.not_found': 'Not found',

      // Search
      'search.placeholder':       'SEARCH...',
      'search.rated_placeholder': 'SEARCH RATED ACTS...',
      'search.acts_placeholder':  'SEARCH ACTS...',
      'search.clubs_placeholder': 'SEARCH CLUBS...',
      'search.events_placeholder':'SEARCH EVENTS...',
      'search.back':              'Back',
      'search.results_for':       'Results for',

      // Sort
      'sort.interested': 'Interested',
      'sort.time':       'Time',
      'sort.score':      'Score',
      'sort.best_first': 'Best first',
      'sort.worst_first':'Worst first',
      'sort.most_rated': 'Most rated',
      'sort.name_az':    'Name A–Z',

      // Loading
      'loading.events':  'Loading events',
      'loading.profile': 'Loading profile',
      'loading.generic': 'Loading...',
      'loading.stats':   'Loading stats…',

      // Auth
      'auth.title':            'Join the Radar',
      'auth.account':          'Account',
      'auth.mode_label':       'Auth mode',
      'auth.google_continue': 'Continue with Google',
      'auth.google_login':    'Login with Google',
      'auth.google_signup':   'Sign up with Google',
      'auth.apple_continue':  'Continue with Apple',
      'auth.apple_login':     'Login with Apple',
      'auth.apple_signup':    'Sign up with Apple',
      'auth.or_email':        'or with email',
      'auth.email':           'Email',
      'auth.name':            'Name',
      'auth.password':        'Password',
      'auth.login':           'Login',
      'auth.signup':          'Signup',

      // Rating modal
      'rating.title':       '// RATING',
      'rating.group_label': 'Rating',
      'rating.surprise': 'Surprise of the night',
      'rating.submit':   'Rate',
      'rating.saving':   'Saving...',
      'rating.saved':    'Saved!',
      'rating.error':    'Error saving.',

      // Status bar
      'status.live':    'Live',
      'status.profile': 'Profile',
      'status.updated': 'Updated:',

      // Profile page
      'profile.back':           '← Back to Events',
      'profile.eyebrow':        '// PROFILE',
      'profile.not_logged_in':  'Not logged in',
      'profile.login_required': 'Login required to view your profile.',
      'profile.back_home':      'Back to homepage →',
      'profile.stat_nights':    'Nights',
      'profile.stat_queue':     'Queue',
      'profile.stat_inclub':    'In Club',
      'profile.stat_ratings':   'Ratings',
      'profile.detail_queue':   '// QUEUE',
      'profile.avg_wait':       'Avg. Wait',
      'profile.longest_queue':  'Longest Queue',
      'profile.fastest_entry':  'Fastest Entry',
      'profile.entry_rate':     'Entry Rate',
      'profile.detail_timing':  '// TIMING',
      'profile.latest_exit':    'Latest Exit',
      'profile.earliest_start': 'Earliest Start',
      'profile.recommendations':'Recommendations',
      'profile.rec_tooltip':    'Based on your ratings and users with similar taste — people who rated the same DJs similarly recommend artists you haven\'t rated yet. The more you rate, the better the suggestions.',
      'profile.rated_acts':     'Rated Acts',
      'profile.followed_acts':  'Followed Acts',
      'profile.followed_clubs': 'Followed Clubs',
      'profile.visited_events':   'Visited Events',
      'profile.saved_events':     'Saved Events',
      'profile.upcoming_events':  'Upcoming Events',
      'profile.past_events':      'Past Events',
      'profile.max_level':      'Max level reached',
      'profile.max':            'Max',
      'profile.since':          'Since',
      'profile.recommendations_empty': 'Not enough ratings for recommendations yet - rate more acts!',
      'profile.rated_acts_label': 'Rated Acts',
      'profile.all':               'All',
      'profile.follow_artist':     'Follow artist',
      'profile.unfollow_artist':   'Unfollow artist',
      'profile.dismiss_recommendation': 'Dismiss recommendation',
      'profile.no_followed_acts':        'No followed acts yet.',
      'profile.no_followed_acts_search': 'No acts found for this search.',
      'profile.no_rated_acts_search':    'No rated acts found for this search.',
      'profile.no_rated_acts_filter':    'No acts with this rating.',
      'profile.no_followed_clubs':       'No followed clubs yet.',
      'profile.no_followed_clubs_search':'No clubs found for this search.',
      'profile.no_visited_events':       'No visited events yet.',
      'profile.no_saved_events':         'No saved events marked as interested yet.',
      'profile.no_saved_events_search':  'No events found for this search.',
      'profile.summary_queue':           '{minutes} min queue',
      'profile.summary_in_club':         '{duration} in club',
      'profile.summary_exit':            'Exit {time}',
      'profile.locked_badge':            'Not unlocked yet',

      // Profile tabs
      'tabs.acts':   'Acts',
      'tabs.dabei':  'Attended',
      'tabs.saved':  'Saved',
      'tabs.clubs':  'Clubs',
      'tabs.badges': 'Badges',

      // Settings
      'settings.title':                '// SETTINGS',
      'settings.close':                '✕ CLOSE',
      'settings.display_name':         'Display Name',
      'settings.display_name_placeholder': 'New display name',
      'settings.save':                 'Save',
      'settings.email':                'Email address',
      'settings.email_placeholder':    'New email',
      'settings.password':             'Password',
      'settings.password_placeholder': 'New password (min. 6 chars)',
      'settings.language':             'Language / Sprache',
      'settings.push_notif':           'Push notifications',
      'settings.enable_notif':         'Enable notifications →',
      'settings.logout':               'Log out',
      'settings.delete_account':       'Delete account',
      'settings.delete_warning':       'Warning: All your data will be permanently deleted.',
      'settings.confirm_delete':       'Yes, permanently delete account',
      'settings.cancel':               'Cancel',
      'settings.name_required':        'Please enter a name.',
      'settings.email_required':       'Please enter an email.',
      'settings.password_min':         'Min. 6 characters required.',
      'settings.name_saved':           'Name saved.',
      'settings.email_saved':          'Confirmation email sent.',
      'settings.password_saved':       'Password changed.',
      'settings.lang_saved':           'Language saved.',
      'settings.deleting':             'Deleting...',
      'settings.delete_error':         'Error: ',
      'settings.unknown_error':        'Unknown error',
      'push.unsupported':       'Push notifications are not supported by this browser.',
      'push.blocked':           'Notifications blocked. <br><span style="font-size:10px;color:var(--grey-lt)">Please allow them in your browser settings.</span>',
      'push.not_enabled':       'Not enabled',
      'push.enabling':          'Enabling...',
      'push.enabled':           'Enabled',
      'push.permission_denied': 'Permission denied.',

      // Notifications
      'notif.act_event_label':         'Timetable — DJ + Event',
      'notif.act_event_desc':          'When times are released for a DJ at an event you follow and the DJ you follow',
      'notif.timetable_public_label':  'Timetable public',
      'notif.timetable_public_desc':   'When the timetable for an event you follow is published',
      'notif.guestlist_label':         'Guestlist / Friendlist / Skiplist',
      'notif.guestlist_desc':          'When a DJ you follow offers a guestlist in their story for an event you follow',
      'notif.new_event_club_label':    'New Event — Club',
      'notif.new_event_club_desc':     'When a club you follow announces a new event',
      'notif.reminder_label':          'Event Reminder',
      'notif.reminder_desc':           'Morning reminder on the day of an event you follow',

      // Site X
      'sitex.eyebrow':            '// COMMUNITY CANVAS',
      'sitex.desc':               'This page belongs to you.\nComment on Instagram or TikTok — the comment with the most likes gets built.\nA message to the scene. A marriage proposal. Your master\'s thesis survey. Anything is possible.',
      'sitex.loading':            'Loading edition...',
      'sitex.next_drop':          '// Next Drop',
      'sitex.status_voting':      'Voting',
      'sitex.status_building':    'Building',
      'sitex.status_live':        'Live',
      'sitex.or':                 'or',
      'sitex.bip_voting_text':    'Comment what should happen on this page.\nThe comment with the most likes wins.',
      'sitex.bip_building_text':  'The winning comment is being built right now.\nCome back soon.',
      'sitex.voting_banner_title':'Voting is live on Instagram & TikTok',
      'sitex.voting_banner_text': 'Comment what should happen on this page. Most likes wins.',
      'sitex.archive_label':      '// Archive',
      'sitex.archive_empty':      'No past editions yet.',
      'sitex.no_edition':         'No edition available yet. Come back soon.',
      'sitex.back_events':        '← Back to events',

      // Dates
      'date.today':          'Today',
      'date.yesterday':      'Yesterday',
      'date.two_days_ago':   'Day before yesterday',
      'date.tomorrow':       'Tomorrow',
      'date.months_short':   ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      'date.weekdays_short': ['Su','Mo','Tu','We','Th','Fr','Sa'],
      'date.weekdays_long':  ['Su','Mo','Tu','We','Th','Fr','Sa'],

      // Acts / event cards
      'act.best':        'Best Act',
      'act.surprise':    'Surprise',
      'act.gem':         'Hidden Gem',
      'act.from':        'from {time}',
      'act.canceled':    'CANCELED',
      'act.rate':        'Rate',
      'act.rate_change': 'Change rating',

      // Status badges
      'status.timetable': 'Timetable',
      'status.lineup':    'Lineup',

      // Empty states
      'empty.no_events':          'No events found',
      'empty.no_events_day':      'No events today',
      'empty.no_results':         'No results for "{q}"',
      'empty.no_upcoming':        'No upcoming events',
      'empty.loading':      'Loading...',
      'empty.no_acts':      'No acts',
      'empty.no_club_data': 'No personal data for this club yet.',
      'empty.no_trend':     'No trend yet',

      // Spotlight
      'spotlight.last_night': 'Last night',
      'spotlight.trending':   'Trending',
      'spotlight.best':       'Best Act',
      'spotlight.surprise':   'Surprise',
      'spotlight.gem':        'Hidden Gem',
      'spotlight.no_votes':   'No votes yet',
      'spotlight.no_votes':   'No votes yet',

      // User
      'user.guest':     'Guest',
      'user.logged_in': 'Online',

      // Live panel
      'live.goodbye_title':     'Good night',
      'live.goodbye_sub':       'You left {event}.',
      'live.status_queue':      'Queue',
      'live.status_inclub':     'In Club',
      'live.status_left':       'Left',
      'live.open_hint':         'Open Live UI ▲',
      'live.section_night':     '// YOUR NIGHT',
      'live.section_queue':     '// QUEUE',
      'live.section_spotlights':'// SPOTLIGHTS',
      'live.section_timetable': '// LINEUP & TIMETABLE',
      'live.enter_club':        'Enter club',
      'live.leave_club':        'Leave club',
      'live.denied':            'Access Denied',
      'live.queue_entry':       'Queue entry',
      'live.club_entry':        'Club entry',
      'live.wait_time':         'Wait time',
      'live.in_queue_since':    'In queue since',
      'live.queue_legend_green':'under 30 min',
      'live.queue_legend_yellow':'30–60 min',
      'live.queue_legend_red':  'over 60 min',
      'live.surprise_btn':      '★ Surprise',
      'live.surprise_hint':     '★ Surprise of the night can only be given once',
      'live.tba':               'TBA',
      'live.no_queue_reports':  'No queue reports for this event yet.',
      'live.queue_chart_aria':  'Queue trend',
      'live.join_queue':        'Join queue',
      'live.queue_locked':      'Join queue',
      'live.queue_open':        'Queue ▲',
      'live.in_club_open':      'In Club ▲',
      'live.queue_locked_info': 'You can join the queue at the earliest 1 hour before the event starts.',
      'live.score_info':        'Rate more DJs to see a personal score. The more you and other users rate, the more accurately we can predict how much you will enjoy the event.',

      // Queue status (event cards + live panel)
      'queue.label':           'Queue',
      'queue.in_queue_count':  '{n} in queue',
      'queue.in_club_count':   '{n} in club',
      'queue.avg_wait':        'Ø {n} min avg wait',
      'queue.nobody_yet':      'Nobody in queue yet',
      'queue.join_hint':       'Join the queue to start tracking',

      // Club stats
      'club.avg_wait':    'Avg. Wait',
      'club.entry_rate':  'Entry Rate',

      // Misc
      'misc.back':    'Back',
      'misc.artist':  'Artist',
      'misc.time':    'Time',
      'misc.no_info': 'No info yet',
      'misc.until':   'until {time}',
      'misc.search_banner_no_events': ' - No upcoming events',
      'past.your_night':       '// YOUR NIGHT',
      'past.arrival':          'Arrival',
      'past.entry':            'Entry',
      'past.exit':             'Exit',
      'past.in_club':          'In club',
      'past.no_data':          'No data recorded.',
      'past.edit_times':       'Edit times',
      'past.edit_hint':        'Set date and time directly - no more automatic guessing.',
      'past.no_votes':         'No votes yet',
      'past.lineup_rating':    '// LINE-UP & RATING',
      'past.completed':        'Completed',
      'past.queue_timeline':   '// QUEUE TREND OF THE NIGHT',
      'past.surprise_button':  'â˜… Surprise',
      'past.surprise_hint':    'â˜… Surprise of the night can only be given once',
      'past.event_not_found':  'Event not found.',
      'past.load_error':       'Error while loading.',
      'past.queue_chart_aria': 'Queue trend',

      // Badge descriptions
      'badge.queue_rat_desc':       'You know the queue. You love the queue. Total time in queues.',
      'badge.vip_energy_desc':      'You don\'t wait. Your avg. queue time is low — at least 5 nights.',
      'badge.vip_energy_nights':    '{n}/5 nights needed',
      'badge.vip_energy_no_data':   'No queue data yet',
      'badge.night_owl_desc':       'The club closes — you don\'t. Number of nights with exit after 10am.',
      'badge.early_bird_desc':      'First come, first served. Queue entry before midnight.',
      'badge.resident_desc':        'One club. Your club. Max nights at the same club.',
      'badge.scene_kid_desc':       'You follow the scene. Number of followed acts.',
      'badge.tastemaker_desc':      'You listen and judge. Number of rated acts.',
      'badge.surprise_picker_desc': 'You spot the unexpected moment. Times you marked an act as surprise of the night.',
      'badge.ghost_desc':           'You were in the queue. You never got in. A classic.',
      'badge.survivor_desc':        '2+ hours waited and still got in. Respect.',
      'badge.closer_desc':          'You leave when the lights come on. 12+ hours straight in the club.',
      'badge.explorer_desc':        'Berlin has many clubs. You know them all. Different clubs visited.',
    },

    de: {
      // Nav
      'nav.guest':        'Gast',
      'nav.login':        'Login',
      'nav.logout':       'Logout',
      'nav.city_select':  'Stadt wählen',
      'nav.search_city':  'Stadt suchen',

      // Footer
      'footer.impressum': 'Impressum',
      'footer.privacy':   'Datenschutz',
      'footer.terms':     'Nutzungsbedingungen',
      'common.close':     'Schliessen',
      'common.previous':  'Vorherige',
      'common.next':      'Naechste',
      'common.saved':     'Gespeichert.',
      'common.loading':   'Laedt...',
      'common.not_found': 'Nicht gefunden',

      // Search
      'search.placeholder':       'SUCHEN...',
      'search.rated_placeholder': 'BEWERTETE ACTS SUCHEN...',
      'search.acts_placeholder':  'ACTS SUCHEN...',
      'search.clubs_placeholder': 'CLUBS SUCHEN...',
      'search.events_placeholder':'EVENTS SUCHEN...',
      'search.back':              'Zurück',
      'search.back_btn':          'Zurueck',
      'search.results_for':       'Ergebnisse fuer',

      // Sort
      'sort.interested': 'Interessiert',
      'sort.time':       'Uhrzeit',
      'sort.score':      'Score',
      'sort.best_first': 'Beste zuerst',
      'sort.worst_first':'Schlechteste zuerst',
      'sort.most_rated': 'Meist bewertet',
      'sort.name_az':    'Name A–Z',

      // Loading
      'loading.events':  'Lade Events',
      'loading.profile': 'Lade Profil',
      'loading.generic': 'Lädt...',
      'loading.stats':   'Lade Stats…',

      // Auth
      'auth.title':            'Join the Radar',
      'auth.account':          'Account',
      'auth.mode_label':       'Auth Modus',
      'auth.google_continue': 'Mit Google fortfahren',
      'auth.google_login':    'Mit Google anmelden',
      'auth.google_signup':   'Mit Google registrieren',
      'auth.apple_continue':  'Mit Apple fortfahren',
      'auth.apple_login':     'Mit Apple anmelden',
      'auth.apple_signup':    'Mit Apple registrieren',
      'auth.or_email':        'oder mit E-Mail',
      'auth.email':           'E-Mail',
      'auth.name':            'Name',
      'auth.password':        'Passwort',
      'auth.login':           'Login',
      'auth.signup':          'Signup',

      // Rating modal
      'rating.title':       '// BEWERTUNG',
      'rating.group_label': 'Bewertung',
      'rating.surprise': 'Überraschung des Abends',
      'rating.submit':   'Bewerten',
      'rating.saving':   'Wird gespeichert...',
      'rating.saved':    'Gespeichert!',
      'rating.error':    'Fehler beim Speichern.',

      // Status bar
      'status.live':    'Live',
      'status.profile': 'Profil',
      'status.updated': 'Stand:',

      // Profile page
      'profile.back':           '← Zurück zu den Events',
      'profile.eyebrow':        '// PROFIL',
      'profile.not_logged_in':  'Nicht eingeloggt',
      'profile.login_required': 'Login erforderlich um dein Profil zu sehen.',
      'profile.back_home':      'Zurück zur Startseite →',
      'profile.stat_nights':    'Nächte',
      'profile.stat_queue':     'Queue',
      'profile.stat_inclub':    'Im Club',
      'profile.stat_ratings':   'Ratings',
      'profile.detail_queue':   '// QUEUE',
      'profile.avg_wait':       'Ø Wartezeit',
      'profile.longest_queue':  'Längste Queue',
      'profile.fastest_entry':  'Schnellster Einlass',
      'profile.entry_rate':     'Einlassquote',
      'profile.detail_timing':  '// TIMING',
      'profile.latest_exit':    'Spätester Exit',
      'profile.earliest_start': 'Frühester Start',
      'profile.recommendations':'Empfehlungen',
      'profile.rec_tooltip':    'Basiert auf deinen Ratings und Usern mit ähnlichem Geschmack — wer dieselben DJs ähnlich bewertet hat, empfiehlt dir Artists die du noch nicht bewertet hast. Je mehr du bewertest, desto besser die Vorschläge.',
      'profile.rated_acts':     'Bewertete Acts',
      'profile.followed_acts':  'Gefolgte Acts',
      'profile.followed_clubs': 'Gefolgte Clubs',
      'profile.visited_events':   'Besuchte Events',
      'profile.saved_events':     'Gespeicherte Events',
      'profile.upcoming_events':  'Kommende Events',
      'profile.past_events':      'Vergangene Events',
      'profile.max_level':      'Max Level erreicht',
      'profile.max':            'Max',
      'profile.since':          'Seit',
      'profile.recommendations_empty': 'Noch nicht genug Ratings fuer Empfehlungen - bewerte mehr Acts!',
      'profile.rated_acts_label': 'Bewertete Acts',
      'profile.all':               'Alle',
      'profile.follow_artist':     'Artist folgen',
      'profile.unfollow_artist':   'Artist entfolgen',
      'profile.dismiss_recommendation': 'Empfehlung entfernen',
      'profile.no_followed_acts':        'Noch keine Acts gefolgt.',
      'profile.no_followed_acts_search': 'Keine Acts fuer diese Suche gefunden.',
      'profile.no_rated_acts_search':    'Keine bewerteten Acts für diese Suche gefunden.',
      'profile.no_rated_acts_filter':    'Keine Acts mit dieser Bewertung.',
      'profile.no_followed_clubs':       'Noch keine Clubs gefolgt.',
      'profile.no_followed_clubs_search':'Keine Clubs fuer diese Suche gefunden.',
      'profile.no_visited_events':       'Noch keine besuchten Events.',
      'profile.no_saved_events':         'Noch keine Events als Interessiert markiert.',
      'profile.no_saved_events_search':  'Keine Events fuer diese Suche gefunden.',
      'profile.summary_queue':           '{minutes} min Queue',
      'profile.summary_in_club':         '{duration} im Club',
      'profile.summary_exit':            'Exit {time}',
      'profile.locked_badge':            'Noch nicht freigeschaltet',

      // Profile tabs
      'tabs.acts':   'Acts',
      'tabs.dabei':  'Dabei',
      'tabs.saved':  'Gespeichert',
      'tabs.clubs':  'Clubs',
      'tabs.badges': 'Badges',

      // Settings
      'settings.title':                '// EINSTELLUNGEN',
      'settings.close':                '✕ SCHLIESSEN',
      'settings.display_name':         'Anzeigename',
      'settings.display_name_placeholder': 'Neuer Anzeigename',
      'settings.save':                 'Speichern',
      'settings.email':                'E-Mail-Adresse',
      'settings.email_placeholder':    'Neue E-Mail',
      'settings.password':             'Passwort',
      'settings.password_placeholder': 'Neues Passwort (min. 6 Zeichen)',
      'settings.language':             'Sprache / Language',
      'settings.push_notif':           'Push-Benachrichtigungen',
      'settings.enable_notif':         'Benachrichtigungen aktivieren →',
      'settings.logout':               'Ausloggen',
      'settings.delete_account':       'Account löschen',
      'settings.delete_warning':       'Achtung: Alle deine Daten werden unwiderruflich gelöscht.',
      'settings.confirm_delete':       'Ja, Account endgültig löschen',
      'settings.cancel':               'Abbrechen',
      'settings.name_required':        'Bitte Namen eingeben.',
      'settings.email_required':       'Bitte E-Mail eingeben.',
      'settings.password_min':         'Min. 6 Zeichen erforderlich.',
      'settings.name_saved':           'Name gespeichert.',
      'settings.email_saved':          'Bestätigungsmail gesendet.',
      'settings.password_saved':       'Passwort geändert.',
      'settings.lang_saved':           'Sprache gespeichert.',
      'settings.deleting':             'Wird geloescht...',
      'push.unsupported':       'Push-Benachrichtigungen werden von diesem Browser nicht unterstuetzt.',
      'push.blocked':           'Benachrichtigungen blockiert. <br><span style="font-size:10px;color:var(--grey-lt)">Bitte in den Browser-Einstellungen freigeben.</span>',
      'push.not_enabled':       'Nicht aktiviert',
      'push.enabling':          'Wird aktiviert...',
      'push.enabled':           'Aktiviert',
      'push.permission_denied': 'Berechtigung verweigert.',
      'settings.delete_error':         'Fehler: ',
      'settings.unknown_error':        'Unbekannter Fehler',

      // Notifications
      'notif.act_event_label':         'Timetable — DJ + Event',
      'notif.act_event_desc':          'Wenn Zeiten für einen DJ rauskommen bei einem Event dem du folgst und dem DJ dem du folgst',
      'notif.timetable_public_label':  'Timetable öffentlich',
      'notif.timetable_public_desc':   'Wenn der Timetable für ein Event veröffentlicht wird dem du folgst',
      'notif.guestlist_label':         'Gästeliste / Friendlist / Skiplist',
      'notif.guestlist_desc':          'Wenn ein DJ dem du folgst in seiner Story eine Gästeliste für ein Event anbietet dem du folgst',
      'notif.new_event_club_label':    'Neues Event — Club',
      'notif.new_event_club_desc':     'Wenn ein Club dem du folgst ein neues Event ankündigt',
      'notif.reminder_label':          'Event-Erinnerung',
      'notif.reminder_desc':           'Erinnerung morgens am Tag eines Events dem du folgst',

      // Site X
      'sitex.eyebrow':            '// COMMUNITY CANVAS',
      'sitex.desc':               'Diese Seite gehört euch.\nKommentiert auf Instagram oder TikTok — der Kommentar mit den meisten Likes wird umgesetzt.\nEine Nachricht an die Szene. Ein Heiratsantrag. Die Umfrage für deine Masterarbeit. Alles ist möglich.',
      'sitex.loading':            'Lade Edition...',
      'sitex.next_drop':          '// Next Drop',
      'sitex.status_voting':      'Voting läuft',
      'sitex.status_building':    'Wird gebaut',
      'sitex.status_live':        'Live',
      'sitex.or':                 'oder',
      'sitex.bip_voting_text':    'Kommentiere was auf dieser Seite passieren soll.\nDer Kommentar mit den meisten Likes gewinnt.',
      'sitex.bip_building_text':  'Der Gewinner-Kommentar wird gerade umgesetzt.\nKomm bald wieder.',
      'sitex.voting_banner_title':'Voting läuft auf Instagram & TikTok',
      'sitex.voting_banner_text': 'Schreib in die Kommentare was auf dieser Seite passieren soll. Meiste Likes gewinnt.',
      'sitex.archive_label':      '// Archiv',
      'sitex.archive_empty':      'Noch keine vergangenen Editionen.',
      'sitex.no_edition':         'Noch keine Edition verfügbar. Komm bald wieder.',
      'sitex.back_events':        '← Zurück zu den Events',

      // Dates
      'date.today':          'Heute',
      'date.yesterday':      'Gestern',
      'date.two_days_ago':   'Vorgestern',
      'date.tomorrow':       'Morgen',
      'date.months_short':   ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
      'date.weekdays_short': ['So','Mo','Di','Mi','Do','Fr','Sa'],
      'date.weekdays_long':  ['So','Mo','Di','Mi','Do','Fr','Sa'],

      // Acts / event cards
      'act.best':        'Bester Act',
      'act.surprise':    'Überraschung',
      'act.gem':         'Geheimtipp',
      'act.from':        'ab {time}',
      'act.canceled':    'ABGESAGT',
      'act.rate':        'Bewerten',
      'act.rate_change': 'Bewertung ändern',

      // Status badges
      'status.timetable': 'Timetable',
      'status.lineup':    'Lineup',

      // Empty states
      'empty.no_events':          'Keine Events gefunden',
      'empty.no_events_day':      'Keine Events an diesem Tag',
      'empty.no_results':         'Keine Ergebnisse fuer "{q}"',
      'empty.no_upcoming':        'Keine kommenden Events',
      'empty.loading':      'Lädt...',
      'empty.no_acts':      'Keine Acts',
      'empty.no_club_data': 'Noch keine persönlichen Daten für diesen Club.',
      'empty.no_trend':     'Noch kein Trend',

      // Spotlight
      'spotlight.last_night': 'Letzte Nacht',
      'spotlight.trending':   'Trending',
      'spotlight.best':       'Bester Act',
      'spotlight.surprise':   'Überraschung',
      'spotlight.gem':        'Geheimtipp',
      'spotlight.no_votes':   'Noch keine Votes',

      // User
      'user.guest':     'Gast',
      'user.logged_in': 'Angemeldet',

      // Live panel
      'live.goodbye_title':     'Gute Nacht',
      'live.goodbye_sub':       'Du hast {event} verlassen.',
      'live.status_queue':      'Warteschlange',
      'live.status_inclub':     'Im Club',
      'live.status_left':       'Verlassen',
      'live.open_hint':         'Live UI öffnen ▲',
      'live.section_night':     '// DEINE NACHT',
      'live.section_queue':     '// WARTESCHLANGE',
      'live.section_spotlights':'// SPOTLIGHTS',
      'live.section_timetable': '// LINE-UP & TIMETABLE',
      'live.enter_club':        'Club betreten',
      'live.leave_club':        'Club verlassen',
      'live.denied':            'Access Denied',
      'live.queue_entry':       'Queue-Eintritt',
      'live.club_entry':        'Club-Eintritt',
      'live.wait_time':         'Wartezeit',
      'live.in_queue_since':    'In der Schlange seit',
      'live.queue_legend_green':'unter 30 min',
      'live.queue_legend_yellow':'30–60 min',
      'live.queue_legend_red':  'über 60 min',
      'live.surprise_btn':      '★ Überraschung',
      'live.surprise_hint':     '★ Überraschung des Abends kann nur einmal vergeben werden',
      'live.tba':               'TBA',
      'live.no_queue_reports':  'Noch keine Warteschlangen-Meldungen für dieses Event.',
      'live.queue_chart_aria':  'Queue-Verlauf',
      'live.join_queue':        'Warteschlange betreten',
      'live.queue_locked':      'Warteschlange betreten',
      'live.queue_open':        'Warteschlange ▲',
      'live.in_club_open':      'Im Club ▲',
      'live.queue_locked_info': 'Du kannst dich frühestens 1 Stunde vor Eventstart in die Warteschlange eintragen.',
      'live.score_info':        'Bewerte mehr DJs um einen persönlichen Score zu sehen. Je mehr du und andere User bewerten, desto genauer wird die Vorhersage wie gut dir das Event gefallen wird.',

      // Queue status (event cards + live panel)
      'queue.label':           'Warteschlange',
      'queue.in_queue_count':  '{n} in der Schlange',
      'queue.in_club_count':   '{n} im Club',
      'queue.avg_wait':        'Ø {n} min Wartezeit',
      'queue.nobody_yet':      'Noch niemand eingetragen',
      'queue.join_hint':       'Trag dich ein um zu starten',

      // Club stats
      'club.avg_wait':    'Ø Wartezeit',
      'club.entry_rate':  'Einlassquote',

      // Misc
      'misc.back': 'Zurück',
      'misc.artist': 'Artist',
      'misc.time':   'Zeit',
      'misc.no_info': 'Noch keine Infos',
      'misc.until':   'bis {time}',
      'misc.search_banner_no_events': ' - Keine kommenden Events',
      'past.your_night':       '// DEINE NACHT',
      'past.arrival':          'Ankunft',
      'past.entry':            'Einlass',
      'past.exit':             'Exit',
      'past.in_club':          'Im Club',
      'past.no_data':          'Keine Daten erfasst.',
      'past.edit_times':       'Zeiten bearbeiten',
      'past.edit_hint':        'Datum und Uhrzeit direkt setzen - kein automatisches Raten mehr.',
      'past.no_votes':         'Noch keine Votes',
      'past.lineup_rating':    '// LINE-UP & BEWERTUNG',
      'past.completed':        'Abgeschlossen',
      'past.queue_timeline':   '// WARTEZEIT-VERLAUF DER NACHT',
      'past.surprise_button':  '★ Ueberraschung',
      'past.surprise_hint':    '★ Ueberraschung des Abends kann nur einmal vergeben werden',
      'past.event_not_found':  'Event nicht gefunden.',
      'past.load_error':       'Fehler beim Laden.',
      'past.queue_chart_aria': 'Queue-Verlauf',

      // Badge descriptions
      'badge.queue_rat_desc':       'Du kennst die Schlange. Du liebst die Schlange. Gesamtzeit in Warteschlangen.',
      'badge.vip_energy_desc':      'Du wartest nicht. Dein Ø in der Queue ist niedrig — mindestens 5 Nächte.',
      'badge.vip_energy_nights':    '{n}/5 Nächte benötigt',
      'badge.vip_energy_no_data':   'Noch keine Queue-Daten',
      'badge.night_owl_desc':       'Der Club schließt — du nicht. Anzahl der Nächte mit Exit nach 10 Uhr.',
      'badge.early_bird_desc':      'Wer früh kommt, kommt rein. Queue-Eintritt vor Mitternacht.',
      'badge.resident_desc':        'Ein Club. Dein Club. Maximale Nächte im selben Club.',
      'badge.scene_kid_desc':       'Du folgst der Szene. Anzahl der gefolgten Acts.',
      'badge.tastemaker_desc':      'Du hörst zu und urteilst. Anzahl der bewerteten Acts.',
      'badge.surprise_picker_desc': 'Du erkennst den unerwarteten Moment. So oft hast du einen Act als Überraschung des Abends markiert.',
      'badge.ghost_desc':           'Du warst in der Queue. Du bist nie reingekommen. Ein Klassiker.',
      'badge.survivor_desc':        '2+ Stunden gewartet und trotzdem reingekommen. Respect.',
      'badge.closer_desc':          'Du gehst wenn das Licht angeht. 12+ Stunden am Stück im Club.',
      'badge.explorer_desc':        'Berlin hat viele Clubs. Du kennst sie alle. Verschiedene Clubs besucht.',
    },
  };

  // Set active language from localStorage (default: 'en')
  const lang = localStorage.getItem('setradar_lang') || 'en';
  window.LANG = (TRANSLATIONS[lang] ? lang : 'en');
  document.documentElement.lang = window.LANG;

  /**
   * Translate a key, with optional param interpolation.
   * t('act.from', { time: '23:00' }) → 'from 23:00' / 'ab 23:00'
   */
  window.t = function t(key, params) {
    const dict = TRANSLATIONS[window.LANG] || TRANSLATIONS.en;
    let str = Object.prototype.hasOwnProperty.call(dict, key)
      ? dict[key]
      : (TRANSLATIONS.en[key] ?? key);
    if (params && typeof str === 'string') {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace('{' + k + '}', v);
      }
    }
    return str;
  };

  /**
   * Apply translations to all data-i18n / data-i18n-placeholder elements.
   * Safe to call multiple times (e.g. after dynamic component injection).
   */
  window.applyTranslations = function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      // Only use for trusted static strings — never for user content
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.dataset.i18nTitle);
    });
  };

  document.addEventListener('DOMContentLoaded', () => window.applyTranslations());

})();
