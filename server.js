const Database = require("better-sqlite3");
const express = require("express");
const cors = require("cors");

const ADMIN_PASSWORD = "Louka45";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===== SESSION CAISSE =====
let sessionActive = false;

let sessionStats = {
  totalSales: 0,
  totalAmount: 0,
  products: {}
};

// ===== DB =====
const db = new Database("/data/db.sqlite");

// ===== TABLES =====
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT,
    price REAL,
    stock INTEGER DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0,
    category TEXT DEFAULT 'other',
    position INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL,
    payment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ===== MIGRATIONS SAFE =====
try { db.exec(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'other'`); } catch(e){}
try { db.exec(`ALTER TABLE products ADD COLUMN position INTEGER DEFAULT 0`); } catch(e){}


// ===== API =====

// GET produits
app.get("/products", (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM products
    ORDER BY position ASC, id ASC
  `).all();

  res.json(rows);
});

// ADD produit
app.post("/products", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    const { name, price, stock = 0, category = "other" } = req.body;

    const max = db.prepare("SELECT MAX(position) as max FROM products").get();

    db.prepare(`
      INSERT INTO products (name, price, stock, category, position)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      price,
      stock,
      category,
      (max.max || 0) + 1
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// UPDATE produit
app.put("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    let { name, price, stock, out_of_stock, category, position } = req.body;

    let finalOut;

    if (out_of_stock) finalOut = 1;
    else if (stock <= 0) finalOut = 1;
    else finalOut = 0;

    db.prepare(`
      UPDATE products 
      SET name=?, price=?, stock=?, out_of_stock=?, category=?, position=? 
      WHERE id=?
    `).run(
      name,
      price,
      stock,
      finalOut,
      category || "other",
      position ?? 0,
      req.params.id
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// DELETE
app.delete("/products/:id", (req, res) => {
  const password = req.headers["x-admin-password"];
  if (password !== ADMIN_PASSWORD) return res.sendStatus(403);

  try {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// LOGIN
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// ===== SESSION =====

// START
app.post("/session/start", (req, res) => {
  sessionActive = true;

  sessionStats = {
    totalSales: 0,
    totalAmount: 0,
    products: {}
  };

  res.sendStatus(200);
});

// STOP (propre)
app.post("/session/stop", (req, res) => {
  sessionActive = false;
  res.json({ success: true });
});

// STATUS
app.get("/session/status", (req, res) => {
  res.json({ active: sessionActive });
});

// EXPORT
app.get("/session/export", (req, res) => {

  let content = `=== SESSION CAISSE ===\n`;
  content += `Date: ${new Date().toLocaleString()}\n\n`;
  content += `Nombre de ventes: ${sessionStats.totalSales}\n`;
  content += `Total: ${sessionStats.totalAmount.toFixed(2)} €\n\n`;
  content += `--- Détail produits ---\n`;

  for (const name in sessionStats.products) {
    content += `${name}: ${sessionStats.products[name]} vendus\n`;
  }

  content += `\n======================`;

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=rapport.txt");
  res.send(content);
});

// ===== SALES =====
app.post("/sales", (req, res) => {
  const { total, payment, items } = req.body;

  const getProduct = db.prepare("SELECT stock, out_of_stock FROM products WHERE id = ?");
  const updateStock = db.prepare("UPDATE products SET stock=?, out_of_stock=? WHERE id=?");
  const insertSale = db.prepare("INSERT INTO sales (total, payment) VALUES (?, ?)");

  const transaction = db.transaction(() => {

    // CHECK STOCK
    for (const item of items) {
      const row = getProduct.get(item.id);

      if (!row) throw new Error("Produit introuvable");

      if (row.out_of_stock === 1 || row.stock < item.qty) {
        throw new Error("Stock insuffisant pour " + item.name);
      }
    }

    // SAVE SALE
    insertSale.run(total, payment);

    // SESSION TRACKING
    if (sessionActive) {
      sessionStats.totalSales += 1;
      sessionStats.totalAmount += parseFloat(total) || 0;

      for (const item of items) {
        if (!sessionStats.products[item.name]) {
          sessionStats.products[item.name] = 0;
        }
        sessionStats.products[item.name] += item.qty;
      }
    }

    // UPDATE STOCK
    for (const item of items) {
      const row = getProduct.get(item.id);
      const newStock = row.stock - item.qty;

      updateStock.run(
        newStock,
        newStock <= 0 ? 1 : 0,
        item.id
      );
    }

  });

  try {
    transaction();
    res.sendStatus(200);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});
