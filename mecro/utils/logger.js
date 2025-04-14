  // utils/logger.js
  // 로깅 유틸리티 함수
  const config = require('../config');

  const logger = {
    debug: (message) => {
      if (config.logging.enabled && config.logging.level === 'debug') {
        console.log(`[DEBUG] ${new Date().toISOString()}: ${message}`);
      }
    },
    
    info: (message) => {
      if (config.logging.enabled && ['debug', 'info'].includes(config.logging.level)) {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
      }
    },
    
    warn: (message) => {
      if (config.logging.enabled && ['debug', 'info', 'warn'].includes(config.logging.level)) {
        console.log(`[WARN] ${new Date().toISOString()}: ${message}`);
      }
    },
    
    error: (message) => {
      if (config.logging.enabled) {
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
      }
    }
  };
  
  module.exports = logger;