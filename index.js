var cookie = require('cookie'),
    methods = require('methods'),
    request = require('supertest'),
    util = require('util');

// A/V pairs defined for Set-Cookie in RFC-6265
var reservedAvs = [
  'path',
  'expires',
  'max-age',
  'domain',
  'secure',
  'httponly'
];

function serializeCookie (c) {
  return Object.keys(c).reduce(function (pairs, key) {
    var isReserved = reservedAvs.indexOf(key.toLowerCase()) === -1;
    if (isReserved) {
      return pairs.concat(decodeURIComponent(cookie.serialize(key, c[key])));
    }
    return pairs;
  }, []);
}

function assignEnvs (envs) {
  Object.keys(envs).forEach(function(e) {
    process.env[e] = envs[e];
  });
}

var deprecatedAssignEnvs = util.deprecate(assignEnvs,
  'supertest-session env configuration is deprecated and will be removed in next version.');

module.exports = function (config) {

  if (!config) config = {};

  function Session () {
    this.app = config.app;

    if (config.envs && (config.envs instanceof Object)) {
      deprecatedAssignEnvs(config.envs);
    }
  }

  Session.prototype._before = function (req) {
    if (this.cookies) {
      req.cookies = this.cookies.map(serializeCookie).join('; ');
    }
    if (config.before) config.before.call(this, req);
  };

  // Extract cookies once request is complete
  Session.prototype._after = function (req, res) {
    if (config.after) config.after.call(this, req, res);
    if (res.headers.hasOwnProperty('set-cookie')) {
      this.cookies = res.headers['set-cookie'].map(cookie.parse);
    }
  };

  Session.prototype.destroy = function () {
    if (config.destroy) config.destroy.call(this);
    this.cookies = null;
  };

  Session.prototype.request = function (meth, route) {
    var req = request(this.app)[meth](route);
    var sess = this;
    var _end = req.end.bind(req);

    this._before(req);

    req.end = function (callback) {
      return _end(function (err, res) {
        if (err === null) sess._after(req, res);
        return callback(err, res);
      });
    };

    return req;
  };

  methods.forEach(function (m) {
    Session.prototype[m] = function () {
      var args = [].slice.call(arguments);
      return this.request.apply(this, [m].concat(args));
    };
  });

  Session.prototype.del = util.deprecate(Session.prototype.delete,
    'Session.del is deprecated; please use Session.delete');

  if (config.helpers instanceof Object) {
    Object.keys(config.helpers).forEach(function (key) {
      Session.prototype[key] = config.helpers[key];
    });
  }

  return Session;
};

