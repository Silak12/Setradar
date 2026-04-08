(function initSetradarEventCards() {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sortActs(acts) {
    function timeToMinutes(value) {
      if (!value) return Infinity;
      const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
      const total = hours * 60 + minutes;
      return total < 14 * 60 ? total + 1440 : total;
    }

    const withTime = acts
      .filter(act => act.start_time)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const withoutTime = acts
      .filter(act => !act.start_time)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return [...withTime, ...withoutTime];
  }

  function renderEventCard(ev, context) {
    const acts = sortActs(ev.event_acts || []);
    const hasTime = acts.some(act => act.start_time);
    const venue = ev.clubs?.name ?? '-';
    const doors = context.fmtTime(ev.time_start);
    const close = context.fmtTime(ev.time_end);
    const hype = context.getHype(ev.id);
    const isHyped = context.userHypedEventIds.has(Number(ev.id));
    const isOpen = context.expandedEventIds.has(Number(ev.id));
    const isClubFavorite = ev.clubs?.id ? context.favoriteClubIds.has(Number(ev.clubs.id)) : false;
    const headerMeta = typeof context.renderHeaderMeta === 'function'
      ? context.renderHeaderMeta(ev)
      : '';
    const venueHtml = ev.clubs?.id
      ? `<span class="venue-name-group"><span class="venue-tag">${escapeHtml(venue)}</span><button class="club-follow-btn${isClubFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-club" data-club-id="${ev.clubs.id}" aria-pressed="${isClubFavorite}">${isClubFavorite ? '−' : '+'}</button></span>`
      : `<span class="venue-tag">${escapeHtml(venue)}</span>`;
    const highlight = context.eventHighlights.get(Number(ev.id));
    const artistRows = acts.map(act => {
      const start = context.fmtTime(act.start_time);
      const end = context.fmtTime(act.end_time);
      const label = start && end ? `${start} - ${end}` : start ? window.t('act.from', { time: start }) : null;
      const actKey = `${ev.id}_${act.sort_order}`;
      const mins = context.nextActKeys.includes(actKey) ? context.getMinutesUntil(start, ev.event_date) : null;
      const countdown = mins !== null ? context.fmtCountdown(mins) : null;
      const actId = act.acts?.id ?? null;
      const numericActId = actId ? Number(actId) : null;
      const isActFavorite = numericActId ? context.favoriteActIds.has(numericActId) : false;
      const isBestAct = numericActId && highlight?.bestActId === numericActId;
      const isSurprise = numericActId && highlight?.surpriseActId === numericActId;
      const actFollowBtn = actId
        ? `<button class="act-follow-btn${isActFavorite ? ' active' : ''}" type="button" data-action="toggle-favorite-act" data-act-id="${actId}" aria-pressed="${isActFavorite}">${isActFavorite ? '♥' : '♡'}</button>`
        : '';
      const existingRating = actId && context.sessionUser ? context.userActRatings.get(`${actId}:${ev.id}`) : null;
      const actRateBtn = actId && context.sessionUser
        ? existingRating
          ? `<button class="act-rate-btn act-rate-btn--rated" type="button" data-action="open-rating" data-act-id="${actId}" data-act-name="${escapeHtml(act.acts?.name ?? '?')}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}" title="${window.t('act.rate_change')}">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</button>`
          : `<button class="act-rate-btn" type="button" data-action="open-rating" data-act-id="${actId}" data-act-name="${escapeHtml(act.acts?.name ?? '?')}" data-event-id="${ev.id}" data-event-name="${escapeHtml(ev.event_name)}" title="${window.t('act.rate')}">☆☆☆☆☆</button>`
        : '';
      const flairs = [
        isBestAct ? `<span class="act-flair act-flair--best">${window.t('act.best')}</span>` : '',
        isSurprise ? `<span class="act-flair act-flair--surprise">${window.t('act.surprise')}</span>` : '',
      ].filter(Boolean).join('');

      return `
        <div class="artist-row ${start ? 'has-time' : ''}${isActFavorite ? ' artist-row--followed' : ''}">
          <span class="artist-row-left">
            ${context.buildActLeftHtml(actId)}
            ${actFollowBtn}
          </span>
          <span class="artist-name">
            <span class="artist-name-link" ${actId ? `data-act-id="${actId}"` : ''} data-act-name="${escapeHtml(act.acts?.name ?? '?')}">${escapeHtml(act.acts?.name ?? '?')}</span>
            ${flairs ? `<span class="artist-flairs">${flairs}</span>` : ''}
          </span>
          <span class="artist-row-right">
            ${actRateBtn}
            ${countdown ? `<span class="countdown ${mins < 30 ? 'soon' : ''}">${countdown}</span>` : ''}
            ${act.canceled ? `<span class="artist-time canceled">${window.t('act.canceled')}</span>` : label ? `<span class="artist-time confirmed">${label}</span>` : `<span class="time-tba">${window.t('live.tba')}</span>`}
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="event-card${isOpen ? ' open' : ''}" data-event-id="${ev.id}">
        <div class="card-header" data-action="toggle-timetable" data-event-id="${ev.id}">
          <div class="event-heading">
            <div class="event-name">${escapeHtml(ev.event_name)}</div>
            ${headerMeta}
          </div>
          <div class="event-meta">
            ${venueHtml}
            ${doors ? `<span class="doors-time">↳ ${doors}${close ? ' - ' + close : ''}</span>` : ''}
            <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}"><span class="status-dot"></span>${hasTime ? 'Timetable' : 'Lineup'}</span>
            <span class="card-chevron">${isOpen ? '▾' : '▸'}</span>
          </div>
        </div>
        <div class="event-actions">
          <div class="event-actions-left">
            <button class="event-action-button hype-button${isHyped ? ' active' : ''}" type="button" data-action="toggle-hype" data-event-id="${ev.id}" aria-pressed="${isHyped}">
              <span class="spark-icon">&#10022;</span><span>Interessiert</span><span class="hype-count">${hype.total_hype}</span>
            </button>
          </div>
          <div class="event-actions-right">${context.buildPresenceBtn(ev.id)}</div>
        </div>
        <div class="artist-list">${artistRows ? '<div class="lineup-header"><span class="lineup-header-left"><span class="lh-avg lh-label">Ø</span><span class="lh-follow lh-label">♡</span></span><span class="lineup-header-mid lh-label">Artist</span><span class="lineup-header-right"><span class="lh-label">Rate</span><span class="lh-label">Zeit</span></span></div>' : ''}${artistRows || '<span class="time-tba">Noch keine Infos</span>'}</div>
      </div>
    `;
  }

  window.SetradarEventCards = {
    sortActs,
    renderEventCard,
  };
})();
