const SERVER_URL = "https://gmailreader1.onrender.com";
const BADGE_CLASS = "gmail-seen-tracker-badge";
const BADGE_STYLE_ID = "gmail-seen-tracker-style";
const STORAGE_KEY = "gmailSeenTrackerQueues";

if (!window.__gmailSeenTrackerLoaded) {
    window.__gmailSeenTrackerLoaded = true;

    const statusCache = Object.create(null);
    const inflightStatus = Object.create(null);
    let trackingQueues = Object.create(null);

    let updateInProgress = false;
    let updateQueued = false;

    injectBadgeStyles();
    setupSendTracking();
    setupInboxObservers();

    loadQueues().then(() => {
        queueInboxUpdate();
    });

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

    function setupInboxObservers() {
        const observer = new MutationObserver(() => {
            queueInboxUpdate();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            clearOldStatusCache();
            queueInboxUpdate();
        }, 4000);

        fetch(`${SERVER_URL}/status?id=warmup`, { cache: "no-store" }).catch(() => {});
    }

    function clearOldStatusCache() {
        const now = Date.now();
        for (const key of Object.keys(statusCache)) {
            if (now - statusCache[key].ts > 20000) {
                delete statusCache[key];
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

    function normalizeText(value) {
        return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function cleanToLabel(value) {
        return normalizeText(value).replace(/^to:\s*/i, "").replace(/\s+\d+$/, "");
    }

    function makeFingerprint(recipient, subject) {
        return `${cleanToLabel(recipient)}::${normalizeText(subject)}`;
    }

    function getRowRecipient(row) {
        return row.querySelector(".yW span")?.textContent?.trim() || "";
    }

    function getRowSubject(row) {
        return row.querySelector("span.bog")?.textContent?.trim() || "";
    }

    function isSentStyleRow(row) {
        const recipient = getRowRecipient(row);
        return /^to:\s*/i.test(recipient);
    }

    function getBadgeAnchor(row) {
        return row.querySelector("td.yX.xY .yW span")
            || row.querySelector("td.yX.xY span.yP")
            || row.querySelector(".yW span")
            || row.querySelector("td.yX.xY")
            || row.querySelector("td.xY");
    }

    function createOrUpdateBadge(row, anchor, isSeen) {
        const badges = row.querySelectorAll(`.${BADGE_CLASS}`);
        for (let i = 1; i < badges.length; i += 1) {
            badges[i].remove();
        }

        let badge = badges[0];
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

    function getTrackingIdForRow(row, renderedIndexes) {
        const fingerprint = makeFingerprint(getRowRecipient(row), getRowSubject(row));
        const queue = trackingQueues[fingerprint] || [];
        const index = renderedIndexes[fingerprint] || 0;
        renderedIndexes[fingerprint] = index + 1;
        return queue[index] || null;
    }

    function removeLegacyBadges(row) {
        const badges = row.querySelectorAll(`.${BADGE_CLASS}`);
        for (const badge of badges) {
            badge.remove();
        }
    }

    async function updateInbox() {
        const rows = document.querySelectorAll("tr.zA");
        const renderedIndexes = Object.create(null);

        for (const row of rows) {
            const anchor = getBadgeAnchor(row);
            if (!anchor) continue;

            if (!isSentStyleRow(row)) {
                removeLegacyBadges(row);
                continue;
            }

            const trackingId = getTrackingIdForRow(row, renderedIndexes);
            const isSeen = trackingId ? await checkStatus(trackingId) : false;
            createOrUpdateBadge(row, anchor, isSeen);
        }
    }

    function setupSendTracking() {
        document.addEventListener(
            "click",
            (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;

                const sendButton = target.closest('div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"]');
                if (!sendButton) return;

                const composeRoot = sendButton.closest('div[role="dialog"], div.M9, div.AD');
                if (!composeRoot) return;

                if (composeRoot.dataset.gmailSeenTracked === "true") return;

                const recipient = getComposeRecipient(composeRoot);
                const subject = getComposeSubject(composeRoot);
                const body = composeRoot.querySelector('div[aria-label="Message Body"]');
                if (!body) return;

                const trackingId = `trk::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 10)}`;
                const fingerprint = makeFingerprint(recipient, subject);

                const img = document.createElement("img");
                img.setAttribute("data-gmail-seen-pixel", "1");
                img.width = 1;
                img.height = 1;
                img.style.width = "1px";
                img.style.height = "1px";
                img.style.opacity = "0";
                img.style.display = "block";
                img.src = `${SERVER_URL}/track?id=${encodeURIComponent(trackingId)}&t=${Date.now()}`;

                body.appendChild(img);
                composeRoot.dataset.gmailSeenTracked = "true";

                if (!trackingQueues[fingerprint]) {
                    trackingQueues[fingerprint] = [];
                }
                trackingQueues[fingerprint].unshift(trackingId);
                saveQueues();

                fetch(`${SERVER_URL}/arm?id=${encodeURIComponent(trackingId)}`, {
                    method: "GET",
                    cache: "no-store"
                }).catch(() => {});

                queueInboxUpdate();
            },
            true
        );
    }

    function getComposeRecipient(composeRoot) {
        const toArea = composeRoot.querySelector('textarea[name="to"]')
            || composeRoot.querySelector('input[aria-label^="To"]')
            || composeRoot.querySelector('div[aria-label^="To"]');

        const value = toArea?.value || toArea?.textContent || "";
        return normalizeText(value);
    }

    function getComposeSubject(composeRoot) {
        return composeRoot.querySelector('input[name="subjectbox"]')?.value || "";
    }

    function loadQueues() {
        return new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve();
                return;
            }

            chrome.storage.local.get([STORAGE_KEY], (result) => {
                if (chrome.runtime?.lastError) {
                    resolve();
                    return;
                }

                trackingQueues = result?.[STORAGE_KEY] || Object.create(null);
                resolve();
            });
        });
    }

    function saveQueues() {
        if (!chrome?.storage?.local) return;
        chrome.storage.local.set({ [STORAGE_KEY]: trackingQueues }, () => {});
    }
}
