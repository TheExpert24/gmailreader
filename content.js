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
    const openedCache = Object.create(null);
    let updateInProgress = false;
    let updateQueued = false;

    injectBadgeStyles();
    setupObservers();
    setupReadTracking();
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

    function setupReadTracking() {
        document.addEventListener(
            "click",
            (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;

                const row = target.closest("tr.zA");
                if (!row) return;

                const id = getEmailId(row);
                if (!id) return;

                markOpened(id);
            },
            true
        );
    }

    function clearOldCacheEntries() {
        const now = Date.now();
        for (const key of Object.keys(statusCache)) {
            const age = now - statusCache[key].ts;
            if (age > 20000) {
                delete statusCache[key];
            }
        }

        for (const key of Object.keys(openedCache)) {
            if (now - openedCache[key] > 60000) {
                delete openedCache[key];
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

    function getEmailId(row) {
        const legacyMessageId = row.getAttribute("data-legacy-message-id");
        if (legacyMessageId) return `msg::${legacyMessageId}`;

        const legacyThreadId = row.getAttribute("data-legacy-thread-id");
        if (legacyThreadId) return `thread::${legacyThreadId}`;

        const subject = row.querySelector("span.bog")?.textContent?.trim();
        if (subject) return `subject::${subject}`;

        return null;
    }

    function isReadInGmail(row) {
        // Gmail uses class zE for unread rows.
        return !row.classList.contains("zE");
    }

    async function checkStatus(id) {
        if (!id) return false;

        if (openedCache[id]) return true;

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

    function markOpened(id) {
        if (!id || openedCache[id]) return;

        openedCache[id] = Date.now();
        statusCache[id] = { opened: true, ts: Date.now() };

        const img = document.createElement("img");
        img.width = 1;
        img.height = 1;
        img.style.position = "absolute";
        img.style.left = "-9999px";
        img.style.top = "-9999px";
        img.src = `${SERVER_URL}/track?id=${encodeURIComponent(id)}&t=${Date.now()}`;
        document.body.appendChild(img);

        setTimeout(() => {
            img.remove();
            queueInboxUpdate();
        }, 1200);
    }

    function createOrUpdateBadge(container, isSeen) {
        const allBadges = container.querySelectorAll(`.${BADGE_CLASS}`);
        for (let i = 1; i < allBadges.length; i += 1) {
            allBadges[i].remove();
        }

        let badge = allBadges[0];
        if (!badge) {
            badge = document.createElement("span");
            badge.className = BADGE_CLASS;
            container.appendChild(badge);
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

    async function updateInbox() {
        const rows = document.querySelectorAll("tr.zA");

        for (const row of rows) {
            const container = row.querySelector("td.xY");
            if (!container) continue;

            removeLegacyBadgeArtifacts(container);

            const id = getEmailId(row);
            const trackedSeen = id ? await checkStatus(id) : false;
            const gmailSeen = isReadInGmail(row);

            // If user has read it in Gmail, always show Read.
            const isSeen = gmailSeen || trackedSeen;
            createOrUpdateBadge(container, isSeen);
        }
    }
}
