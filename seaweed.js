'use strict';

const Service = require('egg').Service;
const qs = require('querystring');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');
const url = require('url');

function SeaweedFSError(message) {
  this.name = 'SeaweedFSError';
  this.message = message || 'Communication with SeaweedFS failed';
  this.stack = (new Error()).stack;
}

const callService = todoUrl => new Promise(function(resolve, reject) {
  const req = http.request(url.parse(todoUrl), function(res) {
    let body = '';
    let err;

    res.setEncoding('utf8');
    res.on('data', chunk => {
      body += chunk;
    });

    res.on('end', function() {
      const json = JSON.parse(body);
      if (json.error) {
        err = new SeaweedFSError(json.error);
        if (json.volumeId) {
          err.volumeId = json.volumeId;
        }
        return reject(err);
      }
      return resolve(json);
    });
  });
  req.on('error', function(err) {
    reject(err);
  });
  req.end();
});

class weedService extends Service {
  baseUrl() {
    return `http://${this.app.config.weed.server}:${this.app.config.weed.port}/`;
  }

  usePublicUrl() {
    return this.app.config.weed.usePublicUrl || false;
  }

  async _assign(opts) {
    return await callService(url.parse(this.baseUrl() + 'dir/assign?' + qs.stringify(opts)));
  }

  /**
   * 获取系统状态
   */
  async systemStatus() {
    return await callService(url.parse(this.baseUrl() + 'dir/status'));
  }

  async clusterStatus() {
    return await callService(url.parse(this.baseUrl() + 'cluster/status'));
  }

  async masterStatus() {
    return await callService(url.parse(this.baseUrl() + 'cluster/status'));
  }

  async volumeStatus(host) {
    return await callService('http://' + host + '/status');
  }

  async write(file, opts) {
    opts = opts || {};
    const self = this;
    if (file instanceof Array) {
      opts.count = file.length;
      for (let i = 0; i < opts.count; i++) {
        if (typeof file[i] === 'string') {
          file[i] = path.resolve(process.cwd(), file[i]);
        }
      }
    } else {
      opts.count = 1;
      if (typeof file === 'string') {
        file = path.resolve(process.cwd(), file);
      }
      file = [ file ];
    }

    const assignOpts = Object.assign({}, opts);
    delete assignOpts.headers;
    const finfo = await this._assign(assignOpts);
    if (finfo.error) {
      return Promise.reject(finfo.error);
    }
    const proms = [];
    for (let i = 0; i < opts.count; i++) {
      proms.push(new Promise(function(resolve, reject) {
        const form = new FormData();
        const stream = typeof file[i] === 'string' ? fs.createReadStream(file[i]) : null;
        form.append('file', stream ? stream : file[i]);
        const urlParts = url.parse('http://' + (self.usePublicUrl() ? finfo.publicUrl : finfo.url) + '/' + finfo.fid + (opts.count === 1 ? '' : '_' + i));
        const options = Object.assign({}, urlParts);
        if (opts.headers) {
          options.headers = opts.headers;
        }
        const req = form.submit(options, function(err, res) {
          if (err) {
            return reject(err);
          }
          resolve(res);
        });

        if (stream) {
          stream.on('error', function(err) {
            reject(err);
          });
        }

        req.on('error', function(err) {
          reject(err);
        });

        req.on('socket', function(socket) {
          socket.on('error', function(err) {
            reject(err);
          });
        });
      }));
    }

    return Promise.all(proms).then(function() {
      return Promise.resolve(finfo);
    });
  }

  async find(fid, opts) {
    const self = this;
    return new Promise(function(resolve, reject) {
      const options = Object.assign({}, url.parse(self.baseUrl() + 'dir/lookup?volumeId=' + fid));
      if (opts && opts.collection) {
        options.path += `&collection=${opts.collection}`;
      }
      const req = http.request(options, function(res) {
        let body = '';
        let err;

        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', function() {
          const json = JSON.parse(body);
          if (json.error) {
            err = new SeaweedFSError(json.error);
            err.volumeId = json.volumeId;
            return reject(err);
          }
          return resolve(json);
        });
      });
      req.on('error', function(err) {
        reject(err);
      });
      req.end();
    });
  }

  async read(fid, stream, opts, urlExtend = '') {
    const self = this;
    const res = await self.find(fid, opts);
    return new Promise(function(resolve, reject) {
      if (res.locations.length) {
        const options = Object.assign({}, url.parse('http://' + (self.usePublicUrl() ? res.locations[0].publicUrl : res.locations[0].url) + '/' + fid + urlExtend));
        if (opts && opts.headers) {
          options.headers = opts.headers;
        }
        const req = http.request(options, function(res) {
          if (res.statusCode === 404) {
            const err = new SeaweedFSError("file '" + fid + "' not found");
            if (stream) {
              stream.emit('error', err);
            }
            return reject(err);
          }
          if (stream) {
            if (typeof stream.writeHead === 'function') {
              stream.writeHead(res.statusCode, res.headers);
            }
            res.pipe(stream);
            resolve(stream);
          } else {
            const tmp = [];
            res.on('data', function(chunk) {
              tmp.push(chunk);
            });
            res.on('end', function() {
              const buffer = Buffer.concat(tmp);
              resolve(buffer);
            });
          }
        });
        req.on('error', function(err) {
          if (stream) {
            stream.emit('error', err);
          }
          reject(err);
        });
        req.end();
      } else {
        const err = new SeaweedFSError('No volume servers found for volume ' + fid.split(',')[0]);
        if (stream) {
          stream.emit('error', err);
        }
        reject(err);
      }
    });
  }

  async remove(fid, opts) {
    const self = this;
    const result = await self.find(fid, opts);
    return new Promise(function(resolve, reject) {
      const proms = [];
      for (let i = 0, len = result.locations.length; i < len; i++) {
        proms.push(new Promise(function(resolve, reject) {
          const req = http.request(Object.assign(url.parse('http://' + (self.usePublicUrl() ? result.locations[i].publicUrl : result.locations[i].url) + '/' + fid), {
            method: 'DELETE',
          }), function(res) {
            if (res.statusCode === 404) {
              const err = new SeaweedFSError("file '" + fid + "' not found");
              return reject(err);
            }
            const tmp = [];
            res.on('data', function(chunk) {
              tmp.push(chunk);
            });
            res.on('end', function() {
              const buffer = Buffer.concat(tmp);
              const payload = JSON.parse(buffer.toString('utf-8'));

              if (!payload.size) {
                return reject(new SeaweedFSError('File with fid ' + fid + ' could not be removed'));
              }
              resolve(payload);
            });
          });
          req.on('error', function(err) {
            reject(err);
          });
          req.end();
        }));
      }
      Promise.all(proms).then(function() {
        resolve({
          count: result.locations.length,
        });
      }).catch(function(err) {
        reject(err);
      });
    });
  }

  async vacuum(opts) {
    const self = this;
    opts = opts || {};
    return new Promise(function(resolve, reject) {
      const req = http.request(url.parse(self.baseUrl() + 'vol/vacuum?' + qs.stringify(opts)), function(res) {
        const tmp = [];
        res.on('data', function(chunk) {
          tmp.push(chunk);
        });
        res.on('end', function() {
          const buffer = Buffer.concat(tmp);
          resolve(JSON.parse(buffer.toString('utf8')));
        });
      });
      req.on('error', function(err) {
        reject(err);
      });
      req.end();
    });
  }
}
module.exports = weedService;
