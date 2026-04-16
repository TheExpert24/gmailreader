const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const db = {};
const ARMED_AT = {};
const ARM_MIN_DELAY_MS = 8000;

app.get("/arm", (req, res) => {
    const id = req.query.id;
    if (!id) return res.sendStatus(400);

    ARMED_AT[id] = Date.now();
    res.json({ ok: true, armedAt: ARMED_AT[id] });
});

app.get("/track", (req, res) => {
    const id = req.query.id;
    if (!id) return res.sendStatus(400);

    const armedAt = ARMED_AT[id] || 0;
    const shouldCountOpen = armedAt > 0 && Date.now() - armedAt >= ARM_MIN_DELAY_MS;

    if (!db[id]) {
        db[id] = {
            opened: false,
            count: 0,
            firstOpened: null,
            lastOpened: null
        };
    }

    if (shouldCountOpen) {
        db[id].opened = true;
        db[id].count += 1;
        db[id].lastOpened = Date.now();

        if (!db[id].firstOpened) {
            db[id].firstOpened = Date.now();
        }
    }

    const pixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        "base64"
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(pixel);
});

app.get("/status", (req, res) => {
    const id = req.query.id;
    if (!id) return res.json({ opened: false });

    res.json(db[id] || { opened: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
