/* eslint valid-jsdoc: "off" */

'use strict';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
module.exports = appInfo => {
  /**
   * built-in config
   * @type {Egg.EggAppConfig}
   **/
  const config = exports = {};

  /** your config */
  config.weed = {
    server: '127.0.0.1',
    port: 9333,
    masters: [
      {
        host: '127.0.0.1',
        port: 9333,
      },
    ],
    scheme: 'http',
  };

  return {
    ...config,
  };
};
