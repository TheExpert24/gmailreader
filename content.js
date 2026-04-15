const SERVER_URL = "https://gmailreader1.onrender.com";
const BADGE_CLASS = "gmail-seen-tracker-badge";
const LEGACY_BADGE_TEXT = /^(✔|○)\s*(Read|Not Read)$/i;

const statusCache = {};

function getEmailId(row) {
    const legacyMessageId = row.getAttribute("data-legacy-message-id");
    if (legacyMessageId) {
        return `msg::${legacyMessageId}`;
    }

    const legacyThreadId = row.getAttribute("data-legacy-thread-id");
    if (legacyThreadId) {
        return `thread::${legacyThreadId}`;
    }

    const subject = row.querySelector("span.bog")?.textContent?.trim();
    const recipient = row.querySelector(".yW span")?.textContent?.trim();
    const sentAt = row.querySelector("td.xW span")?.getAttribute("title")
        || row.querySelector("td.xW span")?.textContent?.trim();

    if (!subject) return null;

    return `${recipient || "unknown"}::${subject}::${sentAt || "unknown-time"}`;
}

async function checkStatus(id) {
    if (statusCache[id] !== undefined) return statusCache[id];

    try {
        const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        statusCache[id] = !!data.opened;
        return statusCache[id];
    } catch {
        return null;
    }
}

function createBadge(isSeen) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;

    badge.style.marginLeft = "8px";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.gap = "4px";
    badge.style.fontSize = "12px";

    badge.innerHTML = isSeen
        ? `✔ <span style="color:#22c55e;">Read</span>`
        : `○ <span style="color:#9ca3af;">Not Read</span>`;

    return badge;
}

function removeLegacyBadges(container) {
    const spans = container.querySelectorAll("span");

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
        const id = getEmailId(row);
        if (!id) continue;

        const trackedState = await checkStatus(id);
        const isSeen = !!trackedState;

        const container = row.querySelector("td.xY");
        if (!container) continue;

        removeLegacyBadges(container);

        const existingBadges = container.querySelectorAll(`.${BADGE_CLASS}`);
        if (existingBadges.length > 1) {
            for (let i = 1; i < existingBadges.length; i += 1) {
                existingBadges[i].remove();
            }
        }

        const badge = existingBadges[0] || createBadge(isSeen);
        if (!existingBadges[0]) {
            container.appendChild(badge);
        }

        badge.innerHTML = isSeen
            ? `✔ <span style="color:#22c55e;">Read</span>`
            : `○ <span style="color:#9ca3af;">Not Read</span>`;
    }
}

let scheduled = false;

function schedule() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
        updateInbox();
        scheduled = false;
    }, 800);
}

const observer = new MutationObserver(schedule);

observer.observe(document.body, {
    childList: true,
    subtree: true
});

updateInbox();
