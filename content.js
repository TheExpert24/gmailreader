const SERVER_URL = "https://gmailreader1.onrender.com";
const BADGE_CLASS = "gmail-seen-tracker-badge";
const BADGE_STYLE_ID = "gmail-seen-tracker-style";
const STORAGE_KEY = "gmailSeenTrackerMap";

if (!window.__gmailSeenTrackerLoaded) {
    window.__gmailSeenTrackerLoaded = true;

    const statusCache = Object.create(null);
    const inflightStatus = Object.create(null);
    let mapping = Object.create(null);

    let updateInProgress = false;
    let updateQueued = false;

    injectBadgeStyles();
    setupSendTracking();
    setupInboxObservers();

    loadMapping().then(() => {
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

    function snippetPrefix(value) {
        return normalizeText(value).slice(0, 48);
    }

    function cleanToLabel(value) {
        return normalizeText(value).replace(/^to:\s*/i, "").replace(/\s+\d+$/, "");
    }

    function getSentRowFingerprint(row) {
        const name = cleanToLabel(row.querySelector(".yW span")?.textContent || "");
        const subject = normalizeText(row.querySelector("span.bog")?.textContent || "");
        const snippet = snippetPrefix(row.querySelector("span.y2")?.textContent || "");

        if (!name && !subject && !snippet) return null;
        return `${name}::${subject}::${snippet}`;
    }

    function getComposeFingerprint(composeRoot) {
        const toArea = composeRoot.querySelector('textarea[name="to"]')
            || composeRoot.querySelector('input[aria-label^="To"]')
            || composeRoot.querySelector('div[aria-label^="To"]');

        const toText = normalizeText(
            toArea?.value
            || toArea?.textContent
            || Array.from(composeRoot.querySelectorAll("span[email]"))
                .map((node) => node.getAttribute("email") || node.textContent || "")
                .join(",")
        );

        const subject = normalizeText(
            composeRoot.querySelector('input[name="subjectbox"]')?.value
            || ""
        );

        const bodyText = composeRoot.querySelector('div[aria-label="Message Body"]')?.innerText || "";
        const snippet = snippetPrefix(bodyText);

        if (!toText && !subject && !snippet) return null;
        return `${cleanToLabel(toText)}::${subject}::${snippet}`;
    }

    function isSentStyleRow(row) {
        const nameText = row.querySelector(".yW span")?.textContent?.trim() || "";
        return /^to:\s*/i.test(nameText);
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
            if (badge.parentElement !== anchor) anchor.appendChild(badge);
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

    async function updateInbox() {
        const rows = document.querySelectorAll("tr.zA");

        for (const row of rows) {
            const badges = row.querySelectorAll(`.${BADGE_CLASS}`);

            if (!isSentStyleRow(row)) {
                for (const b of badges) b.remove();
                continue;
            }

            const fingerprint = getSentRowFingerprint(row);
            const trackingId = fingerprint ? mapping[fingerprint] : null;
            const opened = trackingId ? await checkStatus(trackingId) : false;

            const anchor = getBadgeAnchor(row);
            if (!anchor) continue;

            createOrUpdateBadge(row, anchor, opened);
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

                const fingerprint = getComposeFingerprint(composeRoot);
                if (!fingerprint) return;
                if (composeRoot.dataset.gmailSeenTracked === "true") return;

                const body = composeRoot.querySelector('div[aria-label="Message Body"]');
                if (!body) return;

                const trackingId = `trk::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 10)}`;
                const img = document.createElement("img");
                img.setAttribute("data-gmail-seen-pixel", "1");
                img.width = 1;
                img.height = 1;
                img.style.width = "1px";
                img.style.height = "1px";
                img.style.opacity = "0";
                img.style.display = "block";
                img.src = `${SERVER_URL}/track?id=${encodeURIComponent(trackingId)}`;

                body.appendChild(img);
                composeRoot.dataset.gmailSeenTracked = "true";

                mapping[fingerprint] = trackingId;
                saveMapping();

                fetch(`${SERVER_URL}/arm?id=${encodeURIComponent(trackingId)}`, {
                    method: "GET",
                    cache: "no-store"
                }).catch(() => {});

                queueInboxUpdate();
            },
            true
        );
    }

    function loadMapping() {
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

                mapping = result?.[STORAGE_KEY] || Object.create(null);
                resolve();
            });
        });
    }

    function saveMapping() {
        if (!chrome?.storage?.local) return;
        chrome.storage.local.set({ [STORAGE_KEY]: mapping }, () => {});
    }
}
