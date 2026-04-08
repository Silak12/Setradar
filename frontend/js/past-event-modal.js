/**
 * past-event-modal.js — Wiederverwendbares Past-Event-Modal
 *
 * Verwendung:
 *   PastEventModal.open(eventId, { supabaseClient, supabaseAnonClient, sessionUser })
 *   PastEventModal.close()
 *
 * Benötigt: Supabase JS geladen, styles.css mit .past-event-* und .pem-* Klassen
 */
window.PastEventModal = (() => {
  'use strict';

  let _sc  = null; // auth client
  let _pub = null; // anon client
  let _user = null;

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtTime(t) { return t ? String(t).slice(0, 5) : null; }

  function _fmtDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    const days   = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    return `${days[d.getDay()]}, ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function _fmtMins(m) {
    if (!m && m !== 0) return '—';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rest = m % 60;
    return rest > 0 ? `${h}h ${rest}min` : `${h}h`;
  }

  function _fmtTs(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // Gibt "YYYY-MM-DDTHH:MM" für datetime-local inputs zurück (lokale Zeit)
  function _fmtDateTimeLocal(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function _fmtDateInput(ts) {
    return _fmtDateTimeLocal(ts).slice(0, 10);
  }

  function _fmtTimeInput(ts) {
    return _fmtDateTimeLocal(ts).slice(11, 16);
  }

  /** Rating-Fenster offen: während Event ODER bis 72h nach Ende */
  function _isRatingOpen(ev) {
    if (!ev?.event_date) return false;
    const timeEnd = ev.time_end || '23:59';
    const [eh, em] = timeEnd.split(':').map(Number);
    const end = new Date(`${ev.event_date}T00:00:00`);
    if (eh < 12) end.setDate(end.getDate() + 1); // nach Mitternacht
    end.setHours(eh, em, 0, 0);
    return Date.now() <= end.getTime() + 72 * 60 * 60 * 1000;
  }

  // ── Spotlight-Berechnung ─────────────────────────────────────────────────────

  function _computeSpotlights(acts, allRatings) {
    if (!allRatings.length) return null;

    // Aggregiere Ratings pro Act (nur reale Ratings > 0)
    const byAct = {};
    allRatings.forEach(r => {
      if (!byAct[r.act_id]) byAct[r.act_id] = { sum: 0, count: 0, surprises: 0 };
      if (r.rating && r.rating > 0) { byAct[r.act_id].sum += r.rating; byAct[r.act_id].count++; }
      if (r.was_surprise) byAct[r.act_id].surprises++;
    });

    // Bayesian-Gewichtung: gleicht kleine Stichproben aus
    // score = (count / (count + C)) * avg + (C / (count + C)) * prior
    const C = 5, PRIOR = 3.5;

    const enriched = acts
      .filter(a => !a.canceled && a.acts && byAct[a.act_id]?.count >= 1)
      .map(a => {
        const d = byAct[a.act_id];
        const avg = d.sum / d.count;
        const score = (d.count / (d.count + C)) * avg + (C / (d.count + C)) * PRIOR;
        return { ...a, avgRating: avg, score, surprises: d.surprises, voteCount: d.count };
      });

    if (!enriched.length) return null;

    const assigned = new Set();

    // 1. Überraschung: meiste Surprise-Votes (mindestens 1)
    const surprise = [...enriched]
      .sort((a, b) => b.surprises - a.surprises)
      .find(a => a.surprises > 0) || null;
    if (surprise) assigned.add(surprise.act_id);

    // 2. Bester Act: höchster Bayesian-Score, nicht bereits vergeben
    const best = [...enriched]
      .filter(a => !assigned.has(a.act_id))
      .sort((a, b) => b.score - a.score)[0] || null;
    if (best) assigned.add(best.act_id);

    // 3. Geheimtipp: avg > 4.0, 5–50 Ratings, nicht bereits vergeben
    const hiddenGem = [...enriched]
      .filter(a => !assigned.has(a.act_id) && a.avgRating > 4.0 && a.voteCount >= 5 && a.voteCount <= 50)
      .sort((a, b) => b.avgRating - a.avgRating)[0] || null;

    if (!best && !surprise && !hiddenGem) return null;
    return { best, surprise, hiddenGem };
  }

  // ── HTML-Builder ─────────────────────────────────────────────────────────────

  function _buildPersonal(myPresence, eventDate, canEdit) {
    const qE = myPresence.find(r => r.status === 'queue');
    const cE = myPresence.find(r => r.status === 'in_club');
    const lE = myPresence.find(r => r.status === 'left');

    if (!qE && !cE && !lE && !canEdit) return '';

    const waitMins = qE && cE ? Math.round((new Date(cE.created_at) - new Date(qE.created_at)) / 60000) : null;
    const stayMins = cE && lE ? Math.round((new Date(lE.created_at) - new Date(cE.created_at)) / 60000) : null;

    const viewRows = [
      qE                      ? ['Ankunft',   _fmtTs(qE.created_at) + ' Uhr'] : null,
      waitMins !== null       ? ['Wartezeit',  _fmtMins(waitMins)]             : null,
      cE                      ? ['Einlass',    _fmtTs(cE.created_at) + ' Uhr'] : null,
      stayMins !== null       ? ['Im Club',    _fmtMins(stayMins)]             : null,
      lE                      ? ['Exit',       _fmtTs(lE.created_at) + ' Uhr'] : null,
    ].filter(Boolean);

    const viewHtml = viewRows.length
      ? viewRows.map(([k, v]) => `
          <div class="pem-personal-row">
            <span class="pem-personal-key">${k}</span>
            <span class="pem-personal-val">${v}</span>
          </div>`).join('')
      : '<div class="pem-personal-empty">Keine Daten erfasst.</div>';

    const editHtml = canEdit ? `
      <div class="pem-personal-edit" hidden>
        <div class="pem-edit-fields">
          <label class="pem-edit-field">
            <span class="pem-edit-label">Ankunft</span>
            <span class="pem-edit-datetime" data-status="queue" data-row-id="${qE?.id || ''}">
              <input type="date" class="pem-date-input" value="${qE ? _fmtDateInput(qE.created_at) : eventDate}">
              <input type="time" class="pem-time-input" value="${qE ? _fmtTimeInput(qE.created_at) : '22:00'}">
            </span>
          </label>
          <label class="pem-edit-field">
            <span class="pem-edit-label">Einlass</span>
            <span class="pem-edit-datetime" data-status="in_club" data-row-id="${cE?.id || ''}">
              <input type="date" class="pem-date-input" value="${cE ? _fmtDateInput(cE.created_at) : eventDate}">
              <input type="time" class="pem-time-input" value="${cE ? _fmtTimeInput(cE.created_at) : '23:00'}">
            </span>
          </label>
          <label class="pem-edit-field">
            <span class="pem-edit-label">Exit</span>
            <span class="pem-edit-datetime" data-status="left" data-row-id="${lE?.id || ''}">
              <input type="date" class="pem-date-input" value="${lE ? _fmtDateInput(lE.created_at) : ''}">
              <input type="time" class="pem-time-input" value="${lE ? _fmtTimeInput(lE.created_at) : ''}">
            </span>
          </label>
        </div>
        <div class="pem-edit-hint">Datum und Uhrzeit direkt setzen — kein automatisches Raten mehr.</div>
        <div class="pem-edit-actions">
          <button class="pem-edit-cancel" type="button">Abbrechen</button>
          <button class="pem-edit-save" type="button" data-event-date="${eventDate}">Speichern</button>
        </div>
      </div>` : '';

    return `
      <div class="pem-personal" data-event-date="${eventDate}">
        <div class="pem-personal-header">
          <div class="pem-section-label">// DEINE NACHT</div>
          ${canEdit ? '<button class="pem-edit-toggle" type="button" title="Zeiten bearbeiten">✎</button>' : ''}
        </div>
        <div class="pem-personal-rows">${viewHtml}</div>
        ${editHtml}
      </div>`;
  }

  function _buildSpotlights(spotlights) {
    if (!spotlights) return '';
    const { best, surprise, hiddenGem } = spotlights;

    function card(label, act, type) {
      if (!act) {
        return `<div class="pem-spot-card pem-spot-card--${type} pem-spot-empty">
          <div class="pem-spot-label">${label}</div>
          <div class="pem-spot-name">Noch keine Votes</div>
        </div>`;
      }
      const name = act.acts?.name || '—';
      const avg  = act.avgRating ? act.avgRating.toFixed(1) : '';
      return `<div class="pem-spot-card pem-spot-card--${type}">
        <div class="pem-spot-label">${label}</div>
        <div class="pem-spot-name">${_esc(name)}</div>
        ${avg ? `<div class="pem-spot-rating">${avg} ★</div>` : ''}
      </div>`;
    }

    return `
      <div class="pem-section">
        <div class="pem-section-label">// SPOTLIGHTS</div>
        <div class="pem-spotlights">
          ${card('Bester Act',   best,      'best')}
          ${card('Überraschung', surprise,  'surprise')}
          ${card('Geheimtipp',   hiddenGem, 'gem')}
        </div>
      </div>`;
  }

  function _buildRatings(acts, myRatings, isOpen, eventId, eventName) {
    if (!acts.length) return '';

    // Find which act currently has surprise flag
    const surpriseActId = Number(
      Object.keys(myRatings).find(id => myRatings[id]?.was_surprise) ?? 0
    );

    // Sort by sort_order (should already be ordered, but ensure it)
    const sorted = acts.slice().sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));

    const ratingRows = sorted
      .filter(a => a.acts)
      .map(a => {
        const myR      = myRatings[a.act_id];
        const canceled = !!a.canceled;
        const isSurp   = a.act_id === surpriseActId;
        const stars    = [1,2,3,4,5].map(i =>
          `<span class="pem-star${myR?.rating >= i ? ' filled' : ''}" data-star="${i}">★</span>`
        ).join('');
        const timeStr  = a.start_time
          ? _fmtTime(a.start_time) + (a.end_time ? ' – ' + _fmtTime(a.end_time) : '')
          : '';
        return `
          <div class="pem-act-row${canceled ? ' pem-act-canceled' : ''}" data-act-id="${a.act_id}">
            <div class="pem-act-info">
              <div class="pem-act-name">${_esc(a.acts.name)}${canceled ? ' <span class="pem-canceled-tag">abgesagt</span>' : ''}</div>
              ${timeStr ? `<div class="pem-act-time">${timeStr}</div>` : ''}
            </div>
            ${!canceled ? `
            <div class="pem-act-rating-col">
              <div class="pem-stars" data-act-id="${a.act_id}">${stars}</div>
              ${isOpen ? `<button class="pem-surprise-btn${isSurp ? ' active' : ''}" data-act-id="${a.act_id}" type="button" title="Überraschung des Abends">★ Überraschung</button>` : ''}
            </div>` : ''}
          </div>`;
      }).join('');

    return `
      <div class="pem-section">
        <div class="pem-section-label">// LINE-UP & BEWERTUNG${!isOpen ? ' <span class="pem-label-note">· Abgeschlossen</span>' : ''}</div>
        ${isOpen ? '<div class="pem-rating-hint">★ Überraschung des Abends kann nur einmal vergeben werden</div>' : ''}
        <div class="pem-act-list">${ratingRows}</div>
      </div>`;
  }

  function _buildQueueTimeline(queueReports) {
    if (!queueReports.length) {
      return `
        <div class="pem-section">
          <div class="pem-section-label">// WARTEZEIT-VERLAUF DER NACHT</div>
          <div class="pem-q-empty">Noch keine Warteschlangen-Meldungen für dieses Event.</div>
        </div>`;
    }

    // Level → geschätzte Wartezeit in Minuten
    const LEVEL_MINS = { green: 15, yellow: 40, red: 80, hell: 150 };

    // event_queue_buckets liefert bereits aggregierte Buckets
    // Felder: bucket_start (timestamp), reports_count, bucket_level (enum)
    const points = queueReports.map(r => ({
      ts:    new Date(r.bucket_start).getTime(),
      value: LEVEL_MINS[r.bucket_level] ?? 15,
      count: r.reports_count ?? 1,
    })).sort((a, b) => a.ts - b.ts);

    if (!points.length) return '';

    // SVG-Dimensionen
    const W = 280, H = 120;
    const ml = 34, mr = 10, mt = 10, mb = 22;
    const cw = W - ml - mr;
    const ch = H - mt - mb;
    const MAX_VAL = 150; // Achsen-Maximum in Minuten

    const toX = ts => {
      if (points.length === 1) return ml + cw / 2;
      const t0 = points[0].ts, t1 = points[points.length - 1].ts;
      return ml + ((ts - t0) / (t1 - t0)) * cw;
    };
    const toY = v => mt + ch - Math.min(v / MAX_VAL, 1) * ch;

    const colorFor = v => {
      if (v < 30)  return '#22c55e';
      if (v < 60)  return '#f59e0b';
      if (v < 90)  return '#f97316';
      if (v < 120) return '#ef4444';
      return '#dc2626';
    };

    // Horizontale Gitterlinien + Y-Achse
    const GRID_VALS = [0, 30, 60, 90, 120, 150];
    const gridLines = GRID_VALS.map(v => {
      const y = toY(v).toFixed(1);
      return `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#1e1e1e" stroke-width="1"/>
              <text x="${ml - 4}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end" fill="#444" font-size="7" font-family="monospace">${v === 0 ? '0' : v + 'm'}</text>`;
    }).join('');

    // Füllbereich unter der Linie
    let fillPath = '';
    if (points.length > 1) {
      const ptStr   = points.map(p => `${toX(p.ts).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
      const bottom  = toY(0).toFixed(1);
      const firstX  = toX(points[0].ts).toFixed(1);
      const lastX   = toX(points[points.length - 1].ts).toFixed(1);
      fillPath = `<polygon points="${ptStr} ${lastX},${bottom} ${firstX},${bottom}" fill="rgba(255,32,32,0.06)" stroke="none"/>`;
    }

    // Liniensegmente (je Segment die Farbe des Durchschnittswerts)
    let lineSegs = '';
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1];
      const avg = (p1.value + p2.value) / 2;
      lineSegs += `<line x1="${toX(p1.ts).toFixed(1)}" y1="${toY(p1.value).toFixed(1)}"
                         x2="${toX(p2.ts).toFixed(1)}" y2="${toY(p2.value).toFixed(1)}"
                         stroke="${colorFor(avg)}" stroke-width="2.5" stroke-linecap="round"/>`;
    }

    // Punkte mit Tooltip
    const dots = points.map(p => {
      const d  = new Date(p.ts);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `<circle cx="${toX(p.ts).toFixed(1)}" cy="${toY(p.value).toFixed(1)}" r="3.5"
                fill="${colorFor(p.value)}" stroke="#111" stroke-width="1.5">
              <title>${hh}:${mm} — ca. ${Math.round(p.value)} min (${p.count} Meldungen)</title>
              </circle>`;
    }).join('');

    // X-Achse: Zeitlabels (nur volle Stunden)
    const seenHours = new Set();
    const xLabels = points.map(p => {
      const d  = new Date(p.ts);
      const mm = d.getMinutes();
      if (mm >= 15 && mm < 45) return ''; // nur bei :00 und :30 labeln
      const hh  = String(d.getHours()).padStart(2, '0');
      const key = hh + ':' + String(mm < 15 ? '00' : '30').padStart(2, '0');
      if (seenHours.has(key)) return '';
      seenHours.add(key);
      return `<text x="${toX(p.ts).toFixed(1)}" y="${H - 5}" text-anchor="middle" fill="#444" font-size="7" font-family="monospace">${hh}:${String(mm < 15 ? '00' : '30').padStart(2,'0')}</text>`;
    }).join('');

    return `
      <div class="pem-section">
        <div class="pem-section-label">// WARTEZEIT-VERLAUF DER NACHT</div>
        <div class="pem-q-chart-wrap">
          <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="pem-q-svg" aria-label="Queue-Verlauf">
            ${gridLines}
            ${fillPath}
            ${lineSegs}
            ${dots}
            ${xLabels}
          </svg>
        </div>
        <div class="pem-q-legend">
          <span><span class="pem-q-dot" style="background:#22c55e"></span>unter 30 min</span>
          <span><span class="pem-q-dot" style="background:#f59e0b"></span>30–60 min</span>
          <span><span class="pem-q-dot" style="background:#ef4444"></span>über 60 min</span>
        </div>
      </div>`;
  }

  // ── Haupt-Render ─────────────────────────────────────────────────────────────

  function _render(overlay, ev, acts, allRatings, myRatings, queueReports, myPresence) {
    const sheet = overlay.querySelector('.past-event-sheet');
    if (!ev) {
      sheet.innerHTML = `<div class="past-event-topline"></div>
        <div class="pem-scroll"><div class="pem-status">Event nicht gefunden.</div></div>`;
      return;
    }

    const club    = ev.clubs?.name || '';
    const city    = ev.clubs?.cities?.name || '';
    const metaParts = [city, club].filter(Boolean);
    const isOpen  = _isRatingOpen(ev);
    const canEdit = !!(_user && _sc);
    const spots   = _computeSpotlights(acts, allRatings);

    sheet.innerHTML = `
      <div class="past-event-topline"></div>
      <button class="past-event-close" aria-label="Schließen">✕</button>
      <div class="pem-scroll">
        <div class="pem-header">
          <div class="pem-event-name">${_esc(ev.event_name)}</div>
          ${metaParts.length ? `<div class="pem-event-meta">${_esc(metaParts.join(' · '))}</div>` : ''}
          <div class="pem-event-date">${_fmtDate(ev.event_date)}${ev.time_start ? ' · ab ' + _fmtTime(ev.time_start) : ''}</div>
        </div>
        ${_buildPersonal(myPresence, ev.event_date, canEdit)}
        ${_buildQueueTimeline(queueReports)}
        ${_buildSpotlights(spots)}
        ${_buildRatings(acts, myRatings, isOpen, ev.id, ev.event_name)}
      </div>`;

    sheet.querySelector('.past-event-close').addEventListener('click', close);

    if (canEdit) {
      _bindPresenceEdits(sheet, myPresence, ev.id, ev.event_date);
    }
    if (isOpen && _user && _sc) {
      _bindRatings(sheet, ev.id, myRatings);
    }
  }

  function _bindPresenceEdits(sheet, myPresence, eventId, eventDate) {
    const personalEl = sheet.querySelector('.pem-personal');
    if (!personalEl) return;
    const toggleBtn = personalEl.querySelector('.pem-edit-toggle');
    const viewRows  = personalEl.querySelector('.pem-personal-rows');
    const editEl    = personalEl.querySelector('.pem-personal-edit');
    if (!toggleBtn || !editEl) return;

    // Toggle edit mode
    toggleBtn.addEventListener('click', () => {
      const editing = !editEl.hidden;
      editEl.hidden = editing;
      viewRows.hidden = !editing;
      toggleBtn.textContent = editing ? '✎' : '✕';
    });
    personalEl.querySelector('.pem-edit-cancel').addEventListener('click', () => {
      editEl.hidden = true;
      viewRows.hidden = false;
      toggleBtn.textContent = '✎';
    });

    editEl.querySelectorAll('.pem-date-input, .pem-time-input').forEach(input => {
      input.addEventListener('wheel', e => {
        if (document.activeElement !== input) return;
        e.preventDefault();
        input.blur();
      }, { passive: false });
    });

    // Save
    personalEl.querySelector('.pem-edit-save').addEventListener('click', async () => {
      const saveBtn = personalEl.querySelector('.pem-edit-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '...';

      const timeToTs = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}`).toISOString();

      try {
        for (const wrapper of editEl.querySelectorAll('.pem-edit-datetime')) {
          const dateValue = wrapper.querySelector('.pem-date-input')?.value || '';
          const timeValue = wrapper.querySelector('.pem-time-input')?.value || '';
          if (!dateValue || !timeValue) continue;
          const status  = wrapper.dataset.status;
          const rowId   = wrapper.dataset.rowId;
          const ts      = timeToTs(dateValue, timeValue);

          if (rowId) {
            await _sc.from('user_presence_log')
              .update({ created_at: ts })
              .eq('id', rowId).eq('user_id', _user.id);
            const row = myPresence.find(r => String(r.id) === rowId);
            if (row) row.created_at = ts;
          } else {
            const { data: newRow } = await _sc.from('user_presence_log')
              .insert({ user_id: _user.id, event_id: eventId, status, created_at: ts })
              .select('id, status, created_at').single();
            if (newRow) {
              myPresence.push(newRow);
              wrapper.dataset.rowId = String(newRow.id);
            }
          }
        }

        // View-Rows aktualisieren
        const qE2 = myPresence.find(r => r.status === 'queue');
        const cE2 = myPresence.find(r => r.status === 'in_club');
        const lE2 = myPresence.find(r => r.status === 'left');
        const w   = qE2 && cE2 ? Math.round((new Date(cE2.created_at) - new Date(qE2.created_at)) / 60000) : null;
        const s   = cE2 && lE2 ? Math.round((new Date(lE2.created_at) - new Date(cE2.created_at)) / 60000) : null;
        const updated = [
          qE2 ? ['Ankunft',  _fmtTs(qE2.created_at) + ' Uhr'] : null,
          w !== null ? ['Wartezeit', _fmtMins(w)] : null,
          cE2 ? ['Einlass',  _fmtTs(cE2.created_at) + ' Uhr'] : null,
          s !== null ? ['Im Club', _fmtMins(s)] : null,
          lE2 ? ['Exit',     _fmtTs(lE2.created_at) + ' Uhr'] : null,
        ].filter(Boolean);
        viewRows.innerHTML = updated.map(([k, v]) => `
          <div class="pem-personal-row">
            <span class="pem-personal-key">${k}</span>
            <span class="pem-personal-val">${v}</span>
          </div>`).join('');

        editEl.hidden = true;
        viewRows.hidden = false;
        toggleBtn.textContent = '✎';
      } catch (err) {
        console.warn('Presence edit error:', err);
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Speichern';
    });
  }

  function _bindRatings(sheet, eventId, myRatings) {
    // ── Sterne (mit Hover-Preview) ────────────────────────────────────────────
    sheet.querySelectorAll('.pem-stars').forEach(starsEl => {
      const allStars = starsEl.querySelectorAll('.pem-star');

      // Hover-Preview
      allStars.forEach((star, idx) => {
        star.addEventListener('mouseenter', () => {
          allStars.forEach((s, i) => s.classList.toggle('preview', i <= idx));
        });
      });
      starsEl.addEventListener('mouseleave', () => {
        allStars.forEach(s => s.classList.remove('preview'));
      });

      // Klick → Bewertung speichern
      starsEl.addEventListener('click', async e => {
        const star = e.target.closest('.pem-star');
        if (!star) return;
        const actId      = Number(starsEl.dataset.actId);
        const rating     = Number(star.dataset.star);
        const wasSurprise = myRatings[actId]?.was_surprise ?? false;

        // Sofortiges Update der Sterne
        allStars.forEach((s, i) => {
          s.classList.toggle('filled', i < rating);
          s.classList.remove('preview');
        });

        try {
          const existing = myRatings[actId];
          const payload  = { user_id: _user.id, act_id: actId, event_id: eventId, rating, was_surprise: wasSurprise, was_best_act: false };
          if (existing) {
            await _sc.from('act_ratings').update(payload)
              .eq('user_id', _user.id).eq('act_id', actId).eq('event_id', eventId);
          } else {
            await _sc.from('act_ratings').insert(payload);
          }
          myRatings[actId] = payload;
        } catch (err) { console.warn('Rating save error:', err); }
      });
    });

    // ── Überraschung des Abends (Radio-Verhalten, exklusiv) ──────────────────
    const surpriseBtns = sheet.querySelectorAll('.pem-surprise-btn');
    surpriseBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const actId   = Number(btn.dataset.actId);
        const wasActive = btn.classList.contains('active');
        const newState  = !wasActive;

        // UI sofort aktualisieren
        surpriseBtns.forEach(b => b.classList.remove('active'));
        if (newState) btn.classList.add('active');

        try {
          // Alle Surprise-Flags für dieses Event löschen
          await _sc.from('act_ratings')
            .update({ was_surprise: false })
            .eq('user_id', _user.id)
            .eq('event_id', eventId);

          Object.keys(myRatings).forEach(id => {
            if (myRatings[id]) myRatings[id] = { ...myRatings[id], was_surprise: false };
          });

          if (newState) {
            const existing = myRatings[actId];
            if (existing) {
              await _sc.from('act_ratings')
                .update({ was_surprise: true })
                .eq('user_id', _user.id).eq('act_id', actId).eq('event_id', eventId);
              myRatings[actId] = { ...existing, was_surprise: true };
            } else {
              // Noch keine Bewertung → Row mit Rating 0 anlegen
              await _sc.from('act_ratings').insert({
                user_id: _user.id, act_id: actId, event_id: eventId,
                rating: 0, was_surprise: true, was_best_act: false,
              });
              myRatings[actId] = { act_id: actId, event_id: eventId, rating: 0, was_surprise: true };
            }
          }
        } catch (err) { console.warn('Surprise update error:', err); }
      });
    });
  }

  // ── Overlay ──────────────────────────────────────────────────────────────────

  function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pastEventOverlay';
    overlay.className = 'past-event-overlay';
    overlay.innerHTML = `
      <div class="past-event-bg"></div>
      <div class="past-event-sheet">
        <div class="past-event-topline"></div>
        <div class="pem-scroll"><div class="pem-status">Lädt…</div></div>
      </div>`;
    overlay.querySelector('.past-event-bg').addEventListener('click', close);
    document.addEventListener('keydown', _keyClose);
    const sheet = overlay.querySelector('.past-event-sheet');
    _addDragToDismiss(overlay, sheet, close);
    return overlay;
  }

  function _keyClose(e) { if (e.key === 'Escape') close(); }

  function _addDragToDismiss(overlay, sheet, onClose) {
    // Attach to overlay (persistent), not to topline (gets replaced by _render)
    let startY = 0, dragging = false;
    const THRESHOLD = 120;

    overlay.addEventListener('touchstart', e => {
      if (!e.target.closest('.past-event-topline')) return;
      startY = e.touches[0].clientY;
      dragging = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    overlay.addEventListener('touchmove', e => {
      if (!dragging) return;
      const delta = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    const finish = e => {
      if (!dragging) return;
      dragging = false;
      const delta = Math.max(0, (e.changedTouches?.[0]?.clientY ?? startY) - startY);
      sheet.style.transition = '';
      if (delta > THRESHOLD) {
        onClose();
      } else {
        sheet.style.transform = '';
      }
    };
    overlay.addEventListener('touchend', finish);
    overlay.addEventListener('touchcancel', finish);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  async function open(eventId, opts = {}) {
    _sc   = opts.supabaseClient    || window.supabaseClient    || null;
    _pub  = opts.supabaseAnonClient || window.supabaseAnonClient || _sc;
    _user = opts.sessionUser       || window.sessionUser       || null;

    close();
    const overlay = _createOverlay();
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    try {
      const [evRes, actsRes, allRatingsRes, queueRes, presenceRes] = await Promise.all([
        _pub.from('events')
          .select('id, event_name, event_date, time_start, time_end, clubs(id, name, cities(name))')
          .eq('id', eventId).maybeSingle(),
        _pub.from('event_acts')
          .select('act_id, start_time, end_time, sort_order, canceled, acts(id, name, insta_name)')
          .eq('event_id', eventId).order('sort_order'),
        _pub.from('act_ratings')
          .select('act_id, rating, was_surprise')
          .eq('event_id', eventId),
        _pub.from('event_queue_buckets')
          .select('bucket_start, reports_count, bucket_level')
          .eq('event_id', eventId).order('bucket_start'),
        _user && _sc
          ? _sc.from('user_presence_log')
              .select('id, status, created_at')
              .eq('event_id', eventId).eq('user_id', _user.id).order('created_at')
          : Promise.resolve({ data: [] }),
      ]);

      const ev           = evRes.data;
      const acts         = actsRes.data || [];
      const allRatings   = allRatingsRes.data || [];
      const queueReports = queueRes.data || [];
      const myPresence   = presenceRes.data || [];

      // Eigene Ratings laden
      let myRatings = {};
      if (_user && _sc && ev) {
        const { data: myRatingRows } = await _sc.from('act_ratings')
          .select('act_id, rating, was_surprise')
          .eq('event_id', eventId).eq('user_id', _user.id);
        (myRatingRows || []).forEach(r => { myRatings[r.act_id] = r; });
      }

      _render(overlay, ev, acts, allRatings, myRatings, queueReports, myPresence);
    } catch (err) {
      console.error('PastEventModal error:', err);
      const sheet = overlay.querySelector('.past-event-sheet');
      sheet.innerHTML = `<div class="past-event-topline"></div>
        <div class="pem-scroll"><div class="pem-status">Fehler beim Laden.</div></div>`;
    }
  }

  function close() {
    const el = document.getElementById('pastEventOverlay');
    if (!el) return;
    document.removeEventListener('keydown', _keyClose);
    el.classList.remove('open');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }

  return { open, close };
})();
