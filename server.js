const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const db = {};

app.get("/track", (req, res) => {
    const id = req.query.id;
    if (!id) return res.sendStatus(400);

    if (!db[id]) {
        db[id] = {
            opened: false,
            count: 0,
            firstOpened: null,
            lastOpened: null
        };
    }

    db[id].opened = true;
    db[id].count += 1;
    db[id].lastOpened = Date.now();

    if (!db[id].firstOpened) {
        db[id].firstOpened = Date.now();
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
