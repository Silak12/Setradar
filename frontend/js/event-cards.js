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

  function getClubColor(clubName) {
    return window.SetradarClubColors ? window.SetradarClubColors.get(clubName) : 'var(--red)';
  }

  function renderEventCard(ev, context) {
    const acts = sortActs(ev.event_acts || []);
    const hasTime = acts.some(act => act.start_time);
    const venue = ev.clubs?.name ?? '-';
    const clubColor = getClubColor(ev.clubs?.name);
    const doors = context.fmtTime(ev.time_start);
    const close = context.fmtTime(ev.time_end);
    const hype = context.getHype(ev.id);
    const isHyped = context.userHypedEventIds.has(Number(ev.id));
    const isOpen = context.expandedEventIds.has(Number(ev.id));
    const headerMeta = typeof context.renderHeaderMeta === 'function'
      ? context.renderHeaderMeta(ev)
      : '';
    const clubChip = `<span class="club-chip club-chip--static">${escapeHtml(venue)}</span>`;
    const highlight = context.eventHighlights.get(Number(ev.id));
    const artistRows = acts.map(act => {
      const start = context.fmtTime(act.start_time);
      const end = context.fmtTime(act.end_time);
      const actKey = `${ev.id}_${act.sort_order}`;
      const mins = context.nextActKeys.includes(actKey) ? context.getMinutesUntil(start, ev.event_date) : null;
      const countdown = mins !== null ? context.fmtCountdown(mins) : null;
      const actId = act.acts?.id ?? null;
      const numericActId = actId ? Number(actId) : null;
      const actName = act.acts?.name ?? '?';
      const isActFavorite = numericActId ? context.favoriteActIds.has(numericActId) : false;
      const isBestAct = numericActId && highlight?.bestActId === numericActId;
      const isSurprise = numericActId && highlight?.surpriseActId === numericActId;
      const myRating = numericActId && context.sessionUser ? context.userActRatings.get(`${numericActId}:${ev.id}`)?.rating : null;
      const flairs = [
        isBestAct ? `<span class="act-flair act-flair--best">${window.t('act.best')}</span>` : '',
        isSurprise ? `<span class="act-flair act-flair--surprise">${window.t('act.surprise')}</span>` : '',
      ].filter(Boolean).join('');
      const timeHtml = act.canceled
        ? `<span class="dj-row-time tba">—</span>`
        : start
          ? `<span class="dj-row-time">${start}${end ? `<small>–${end}</small>` : ''}</span>`
          : `<span class="dj-row-time tba">${window.t('live.tba')}</span>`;

      const starsHtml = numericActId && context.sessionUser && !act.canceled
        ? `<span class="dj-row-stars">${[1, 2, 3, 4, 5].map(i =>
            `<button class="dj-row-star${myRating >= i ? ' filled' : ''}" type="button" data-action="rate-act-inline" data-act-id="${numericActId}" data-event-id="${ev.id}" data-star="${i}" aria-label="${escapeHtml(actName)}: ${i}/5">★</button>`
          ).join('')}</span>`
        : '';

      return `
        <div class="dj-row${isActFavorite ? ' is-followed' : ''}${act.canceled ? ' is-canceled' : ''}${actId ? '' : ' is-static'}"${actId ? ` data-action="open-artist" data-act-id="${actId}" role="button" tabindex="0"` : ''} data-act-name="${escapeHtml(actName)}">
          ${timeHtml}
          <span class="dj-row-name"><span>${escapeHtml(actName)}</span>${flairs ? `<span class="artist-flairs">${flairs}</span>` : ''}</span>
          <span class="dj-row-state">
            ${countdown ? `<span class="countdown${mins < 30 ? ' soon' : ''}">${countdown}</span>` : ''}
            ${act.canceled ? `<span class="dj-row-canceled">${window.t('act.canceled')}</span>` : ''}
            ${starsHtml}
            ${isActFavorite ? `<span class="dj-row-heart" aria-hidden="true">♥</span>` : ''}
            ${actId ? `<span class="dj-row-chevron" aria-hidden="true">▸</span>` : ''}
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="event-card${isOpen ? ' open' : ''}" data-event-id="${ev.id}" style="--club-color:${clubColor}">
        <div class="card-header" data-action="toggle-timetable" data-event-id="${ev.id}">
          <div class="event-heading">
            <div class="event-name">${escapeHtml(ev.event_name)}</div>
            ${headerMeta}
          </div>
          <div class="event-meta">
            ${clubChip}
            ${doors ? `<span class="doors-time">↳ ${doors}${close ? ' - ' + close : ''}</span>` : ''}
            <span class="status-badge ${hasTime ? 'confirmed' : 'pending'}"><span class="status-dot"></span>${hasTime ? window.t('status.timetable') : window.t('status.lineup')}</span>
            <span class="card-chevron">${isOpen ? '▾' : '▸'}</span>
          </div>
        </div>
        <div class="event-actions">
          <div class="event-actions-left">
            <button class="event-action-button hype-button${isHyped ? ' active' : ''}" type="button" data-action="toggle-hype" data-event-id="${ev.id}" aria-pressed="${isHyped}">
              <span class="spark-icon">&#10022;</span><span>${window.t('sort.interested')}</span><span class="hype-count">${hype.total_hype}</span>
            </button>
          </div>
          <div class="event-actions-right">${context.buildPresenceBtn(ev.id)}</div>
        </div>
        <div class="artist-list">${artistRows || `<span class="time-tba">${window.t('misc.no_info')}</span>`}</div>
      </div>
    `;
  }

  window.SetradarEventCards = {
    sortActs,
    renderEventCard,
  };
})();
