const SERVER_URL = "https://gmailreader1.onrender.com";
const BADGE_CLASS = "gmail-seen-tracker-badge";
const LEGACY_BADGE_TEXT = /^(✔|○)\s*(Read|Not Read)$/i;

const statusCache = {};

function getEmailId(row) {
    const subject = row.querySelector("span.bog")?.textContent?.trim();
    const sender = row.querySelector(".yW span")?.textContent?.trim();

    if (!subject) return null;

    return `${sender || "unknown"}::${subject}`;
}

async function checkStatus(id) {
    if (!id) return false;

    if (statusCache[id] !== undefined) return statusCache[id];

    try {
        const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        statusCache[id] = !!data.opened;
        return statusCache[id];
    } catch {
        return false;
    }
}

function createBadge(isSeen) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;

    badge.style.marginLeft = "6px";
    badge.style.display = "inline-block";
    badge.style.verticalAlign = "middle";
    badge.style.whiteSpace = "nowrap";
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
        if (row.dataset.badgeAdded) continue;

        const id = getEmailId(row);
        if (!id) continue;

        const subjectEl = row.querySelector("span.bog");
        if (!subjectEl) continue;

        const isSeen = await checkStatus(id);

        const container = row.querySelector("td.xY");
        if (!container) continue;

        container.appendChild(createBadge(isSeen));

        row.dataset.badgeAdded = "true";
    }
}

function injectPixel() {
    const body = document.querySelector('[aria-label="Message Body"]');
    if (!body || body.dataset.tracked) return;

    const subject = document.querySelector("h2")?.innerText?.trim();
    if (!subject) return;

    const id = subject;

    const img = document.createElement("img");
    img.src = `${SERVER_URL}/track?id=${encodeURIComponent(id)}&t=${Date.now()}`;
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.opacity = "0";

    body.appendChild(img);
    body.dataset.tracked = "true";

    statusCache[id] = true;
}

const observer = new MutationObserver(() => {
    updateInbox();
    injectPixel();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

let lastUrl = location.href;

setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;

        document
            .querySelector('[aria-label="Message Body"]')
            ?.removeAttribute("data-tracked");

        injectPixel();
    }
}, 500);

// warm up render server
fetch(`${SERVER_URL}/status?id=warmup`).catch(() => {});

updateInbox();
