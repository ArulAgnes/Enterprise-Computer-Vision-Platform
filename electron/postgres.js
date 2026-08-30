/**
 * VisionBharat — Embedded PostgreSQL Manager
 * Uses embedded-postgres to download and manage a portable PostgreSQL instance.
 * Data stored in %APPDATA%/VisionBharat/pgdata/
 */

const path = require("path");
const fs = require("fs");

class PostgresManager {
  constructor(userDataPath, log) {
    this.userDataPath = userDataPath;
    this.pgDataDir = path.join(userDataPath, "pgdata");
    this.log = log || console.log;
    this.embeddedPg = null;
    this.isRunning = false;
    this.dbPort = 5433; // Use 5433 to avoid conflict with system PostgreSQL on 5432
    this.dbName = "visionbharat";
    this.dbUser = "postgres";
    this.dbPassword = "visionbharat_local"; // Local-only password
  }

  /**
   * Initialize embedded PostgreSQL.
   * Binaries are pre-bundled in @embedded-postgres/windows-x64 package.
   * No runtime download required.
   */
  async init() {
    this.log("POSTGRES", "Initializing embedded PostgreSQL...");

    // Ensure data directory exists
    if (!fs.existsSync(this.pgDataDir)) {
      fs.mkdirSync(this.pgDataDir, { recursive: true });
    }

    try {
      // Dynamic import for embedded-postgres (ESM module)
      const epModule = await import("embedded-postgres");
      const EmbeddedPostgres = epModule.default;

      this.embeddedPg = new EmbeddedPostgres({
        databaseDir: this.pgDataDir,
        user: this.dbUser,
        password: this.dbPassword,
        port: this.dbPort,
        listen: "127.0.0.1",
        shell: false,
      });

      this.log("POSTGRES", `Data directory: ${this.pgDataDir}`);
      this.log("POSTGRES", `Port: ${this.dbPort}`);
      return true;
    } catch (err) {
      this.log("ERROR", `Failed to initialize embedded PostgreSQL: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start the PostgreSQL server.
   * On first run, downloads binaries (~50-80MB) and initializes the data directory.
   */
  async start() {
    if (this.isRunning) {
      this.log("POSTGRES", "PostgreSQL already running");
      return;
    }

    if (!this.embeddedPg) {
      await this.init();
    }

    this.log("POSTGRES", "Starting embedded PostgreSQL server...");

    try {
      await this.embeddedPg.initialise();
      this.log("POSTGRES", "PostgreSQL data directory initialized");

      await this.embeddedPg.start();
      this.isRunning = true;
      this.log("POSTGRES", `PostgreSQL server started on port ${this.dbPort}`);
    } catch (err) {
      this.log("ERROR", `Failed to start PostgreSQL: ${err.message}`);
      throw err;
    }
  }

  /**
   * Stop the PostgreSQL server gracefully.
   */
  async stop() {
    if (!this.isRunning || !this.embeddedPg) {
      return;
    }

    this.log("POSTGRES", "Stopping embedded PostgreSQL server...");
    try {
      await this.embeddedPg.stop();
      this.isRunning = false;
      this.log("POSTGRES", "PostgreSQL server stopped");
    } catch (err) {
      this.log("WARN", `Error stopping PostgreSQL: ${err.message}`);
      // Force stop attempt
      try {
        await this.embeddedPg.stop();
      } catch {
        // Already stopped or process dead
      }
      this.isRunning = false;
    }
  }

  /**
   * Check if PostgreSQL is accepting connections.
   */
  async isReady() {
    if (!this.isRunning || !this.embeddedPg) return false;

    try {
      const client = await this.getConnection();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a pg Pool connection for the visionbharat database.
   */
  async getPool() {
    const { Pool } = require("pg");
    const pool = new Pool({
      host: "127.0.0.1",
      port: this.dbPort,
      database: this.dbName,
      user: this.dbUser,
      password: this.dbPassword,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
    return pool;
  }

  /**
   * Get a single pg Client connection (for initialization).
   */
  async getClient() {
    const { Client } = require("pg");
    const client = new Client({
      host: "127.0.0.1",
      port: this.dbPort,
      database: this.dbName,
      user: this.dbUser,
      password: this.dbPassword,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    return client;
  }

  /**
   * Get connection string for the Next.js server.
   */
  getConnectionString() {
    return `postgresql://${this.dbUser}:${encodeURIComponent(this.dbPassword)}@127.0.0.1:${this.dbPort}/${this.dbName}`;
  }

  /**
   * Ensure the visionbharat database exists (create if missing).
   */
  async ensureDatabase() {
    this.log("POSTGRES", "Ensuring visionbharat database exists...");

    // Connect to default 'postgres' database to create our database
    const { Client } = require("pg");
    const adminClient = new Client({
      host: "127.0.0.1",
      port: this.dbPort,
      database: "postgres",
      user: this.dbUser,
      password: this.dbPassword,
      connectionTimeoutMillis: 10000,
    });

    try {
      await adminClient.connect();

      // Check if visionbharat database exists
      const result = await adminClient.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [this.dbName]
      );

      if (result.rows.length === 0) {
        this.log("POSTGRES", `Creating database: ${this.dbName}`);
        // Cannot run CREATE DATABASE inside a transaction
        await adminClient.query(`CREATE DATABASE ${this.dbName}`);
        this.log("POSTGRES", "Database created successfully");
      } else {
        this.log("POSTGRES", "Database already exists");
      }
    } finally {
      await adminClient.end();
    }
  }

  /**
   * Backup the database to a file.
   */
  async backup(backupPath) {
    if (!this.isRunning || !this.embeddedPg) {
      throw new Error("PostgreSQL is not running");
    }

    this.log("POSTGRES", `Backing up database to: ${backupPath}`);

    // Ensure backup directory exists
    const dir = path.dirname(backupPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Use pg_dump via embedded-postgres
    const dumpFile = path.join(this.pgDataDir, "dump.sql");
    await this.embeddedPg.dump({
      database: this.dbName,
      username: this.dbUser,
      outputFile: dumpFile,
    });

    // Move to target location
    fs.copyFileSync(dumpFile, backupPath);
    fs.unlinkSync(dumpFile);

    this.log("POSTGRES", "Backup completed successfully");
    return backupPath;
  }

  /**
   * Restore database from a backup file.
   */
  async restore(backupPath) {
    if (!this.isRunning || !this.embeddedPg) {
      throw new Error("PostgreSQL is not running");
    }

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    this.log("POSTGRES", `Restoring database from: ${backupPath}`);

    // Drop and recreate database
    const { Client } = require("pg");
    const adminClient = new Client({
      host: "127.0.0.1",
      port: this.dbPort,
      database: "postgres",
      user: this.dbUser,
      password: this.dbPassword,
    });

    try {
      await adminClient.connect();
      // Terminate existing connections
      await adminClient.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [this.dbName]
      );
      await adminClient.query(`DROP DATABASE IF EXISTS ${this.dbName}`);
      await adminClient.query(`CREATE DATABASE ${this.dbName}`);
    } finally {
      await adminClient.end();
    }

    // Restore from dump
    await this.embeddedPg.restore({
      database: this.dbName,
      username: this.dbUser,
      inputFile: backupPath,
    });

    this.log("POSTGRES", "Restore completed successfully");
  }
}

module.exports = { PostgresManager };
