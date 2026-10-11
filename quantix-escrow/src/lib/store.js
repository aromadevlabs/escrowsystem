'use strict';
// Tiny JSON datastore with atomic writes. Fine for thousands of assets/grants.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      this.data = {};
    }
    this.data.assets = this.data.assets || [];
    this.data.grants = this.data.grants || [];
    this.data.users = this.data.users || {};
    this.data.audit = this.data.audit || [];
    this.save();
  }

  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get assets() { return this.data.assets; }
  get grants() { return this.data.grants; }
  get users() { return this.data.users; }

  audit(actor, action, detail) {
    this.data.audit.unshift({ at: new Date().toISOString(), actor, action, detail });
    if (this.data.audit.length > 2000) this.data.audit.length = 2000;
  }
}

module.exports = Store;
