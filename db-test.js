const { pool } = require('./db');

(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Connected! Time:', res.rows[0]);
    process.exit();
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
})();