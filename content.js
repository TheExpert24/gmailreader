const SERVER_URL = "https://gmailreader1.onrender.com";
const BADGE_CLASS = "gmail-seen-tracker-badge";
const BADGE_STYLE_ID = "gmail-seen-tracker-style";
const LEGACY_BADGE_TEXT = /^(?:✔|○)?\s*(?:Read|Not Read)$/i;

if (window.__gmailSeenTrackerLoaded) {
    // Prevent duplicate observers/badge injection if the content script is re-evaluated.
    void 0;
} else {
    window.__gmailSeenTrackerLoaded = true;

    const statusCache = Object.create(null);
    const inflightStatus = Object.create(null);
    const reportedOpenIds = Object.create(null);
    let updateInProgress = false;
    let updateQueued = false;

    injectBadgeStyles();
    setupObservers();
    queueInboxUpdate();

    function injectBadgeStyles() {
        if (document.getElementById(BADGE_STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = BADGE_STYLE_ID;
        style.textContent = `
            .${BADGE_CLASS} {
                margin-left: 6px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                white-space: nowrap;
                vertical-align: middle;
                font-weight: 500;
            }
            .${BADGE_CLASS}[data-seen="true"] .label {
                color: #22c55e;
            }
            .${BADGE_CLASS}[data-seen="false"] .label {
                color: #9ca3af;
            }
        `;

        document.head.appendChild(style);
    }

    function setupObservers() {
        const observer = new MutationObserver(() => {
            queueInboxUpdate();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Periodic refresh so status can flip to Read after backend updates.
        setInterval(() => {
            clearOldCacheEntries();
            queueInboxUpdate();
        }, 4000);

        // Warm up the backend and ignore transient failures.
        fetch(`${SERVER_URL}/status?id=warmup`, { cache: "no-store" }).catch(() => {});
    }

    function clearOldCacheEntries() {
        const now = Date.now();
        for (const key of Object.keys(statusCache)) {
            const age = now - statusCache[key].ts;
            if (age > 20000) {
                delete statusCache[key];
            }
        }

        for (const key of Object.keys(reportedOpenIds)) {
            if (now - reportedOpenIds[key] > 300000) {
                delete reportedOpenIds[key];
            }
        }
    }

    function queueInboxUpdate() {
        if (updateInProgress) {
            updateQueued = true;
            return;
        }

        updateInProgress = true;
        void updateInbox()
            .catch(() => {})
            .finally(() => {
                updateInProgress = false;
                if (updateQueued) {
                    updateQueued = false;
                    queueInboxUpdate();
                }
            });
    }

    function getEmailIds(row) {
        const ids = [];
        const legacyMessageId = row.getAttribute("data-legacy-message-id");
        if (legacyMessageId) ids.push(`msg::${legacyMessageId}`);

        const legacyThreadId = row.getAttribute("data-legacy-thread-id");
        if (legacyThreadId) ids.push(`thread::${legacyThreadId}`);

        const subject = row.querySelector("span.bog")?.textContent?.trim();
        const person = row.querySelector(".yW span")?.textContent?.trim();
        const sentAt = row.querySelector("td.xW span")?.getAttribute("title")
            || row.querySelector("td.xW span")?.textContent?.trim();

        if (subject && person) ids.push(`${person}::${subject}`);
        if (subject && person && sentAt) ids.push(`${person}::${subject}::${sentAt}`);
        if (subject) ids.push(`subject::${subject}`);
        if (subject) ids.push(subject);

        return [...new Set(ids)];
    }

    async function checkStatus(id) {
        if (!id) return false;

        const cached = statusCache[id];
        if (cached && Date.now() - cached.ts < 4000) {
            return cached.opened;
        }

        if (inflightStatus[id]) {
            return inflightStatus[id];
        }

        inflightStatus[id] = (async () => {
            try {
                const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`, {
                    cache: "no-store"
                });
                const data = await res.json();
                const opened = !!data.opened;
                statusCache[id] = { opened, ts: Date.now() };
                return opened;
            } catch {
                return false;
            } finally {
                delete inflightStatus[id];
            }
        })();

        return inflightStatus[id];
    }

    async function checkStatusFromAnyId(ids) {
        for (const id of ids) {
            const opened = await checkStatus(id);
            if (opened) return true;
        }

        return false;
    }

    function getBadgeAnchor(row) {
        const rightName = row.querySelector("td.yX.xY .yW span")
            || row.querySelector("td.yX.xY span.yP")
            || row.querySelector(".yW span")
            || row.querySelector("span.yP");

        if (rightName) return rightName;

        return row.querySelector("td.yX.xY") || row.querySelector("td.xY");
    }

    function reportOpenForIds(ids) {
        for (const id of ids) {
            if (!id || reportedOpenIds[id]) continue;

            reportedOpenIds[id] = Date.now();
            statusCache[id] = { opened: true, ts: Date.now() };

            const pixel = document.createElement("img");
            pixel.width = 1;
            pixel.height = 1;
            pixel.style.position = "absolute";
            pixel.style.left = "-9999px";
            pixel.style.top = "-9999px";
            pixel.src = `${SERVER_URL}/track?id=${encodeURIComponent(id)}&t=${Date.now()}`;
            document.body.appendChild(pixel);

            setTimeout(() => pixel.remove(), 2000);
        }
    }

    function isSentStyleRow(row) {
        const nameText = row.querySelector(".yW span")?.textContent?.trim() || "";
        return /^to:\s*/i.test(nameText);
    }

    function isReadInGmail(row) {
        // Gmail marks unread rows with zE.
        return !row.classList.contains("zE");
    }

    function createOrUpdateBadge(row, anchor, isSeen) {
        const allRowBadges = row.querySelectorAll(`.${BADGE_CLASS}`);
        for (let i = 1; i < allRowBadges.length; i += 1) {
            allRowBadges[i].remove();
        }

        let badge = allRowBadges[0];
        if (!badge) {
            badge = document.createElement("span");
            badge.className = BADGE_CLASS;
        }

        if (anchor instanceof HTMLTableCellElement || anchor instanceof HTMLDivElement) {
            if (badge.parentElement !== anchor) {
                anchor.appendChild(badge);
            }
        } else {
            anchor.insertAdjacentElement("afterend", badge);
        }

        badge.dataset.seen = String(!!isSeen);
        badge.innerHTML = isSeen
            ? '✔ <span class="label">Read</span>'
            : '○ <span class="label">Not Read</span>';
    }

    function removeLegacyBadgeArtifacts(container) {
        const spans = container.querySelectorAll("span, div");
        for (const span of spans) {
            if (span.classList.contains(BADGE_CLASS)) continue;
            const text = span.textContent?.replace(/\s+/g, " ").trim() || "";
            if (LEGACY_BADGE_TEXT.test(text)) {
                span.remove();
            }
        }
    }

    function injectPixel() {
        const body = document.querySelector('[aria-label="Message Body"]');
        if (!body || body.dataset.tracked) return;

        const subject = document.querySelector("h2")?.innerText?.trim();
        if (!subject) return;

        const img = document.createElement("img");
        img.width = 1;
        img.height = 1;
        img.style.position = "absolute";
        img.style.left = "-9999px";
        img.style.top = "-9999px";
        img.src = `${SERVER_URL}/track?id=${encodeURIComponent(subject)}&t=${Date.now()}`;

        body.appendChild(img);
        body.dataset.tracked = "true";
        statusCache[subject] = { opened: true, ts: Date.now() };
    }

    async function updateInbox() {
        const rows = document.querySelectorAll("tr.zA");

        for (const row of rows) {
            const legacyContainer = row.querySelector("td.xY");
            if (legacyContainer) {
                removeLegacyBadgeArtifacts(legacyContainer);
            }

            const ids = getEmailIds(row);
            const trackedSeen = ids.length ? await checkStatusFromAnyId(ids) : false;
            const anchor = getBadgeAnchor(row);
            if (!anchor) continue;

            // For sent-style rows ("To:"), show recipient-open tracking.
            // For inbox-style rows, show Gmail read state for your local mailbox.
            const sentStyle = isSentStyleRow(row);
            const gmailRead = isReadInGmail(row);

            if (!sentStyle && gmailRead && ids.length) {
                reportOpenForIds(ids);
            }

            const seen = sentStyle
                ? trackedSeen
                : (gmailRead || trackedSeen);

            createOrUpdateBadge(row, anchor, seen);
        }
    }

    const observer = new MutationObserver(() => {
        injectPixel();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            const body = document.querySelector('[aria-label="Message Body"]');
            if (body) body.removeAttribute("data-tracked");
            injectPixel();
        }
    }, 500);

    injectPixel();
}
