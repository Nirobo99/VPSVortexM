/**
 * Utility functions for IP address handling with VPN/proxy support
 * These functions correctly extract real IP from headers while supporting VPN users
 */

/**
 * Get the real client IP address from request headers
 * Supports X-Forwarded-For, X-Real-IP headers for proxy/VPN detection
 * @param {Object} req - Express request object
 * @returns {string} The client IP address
 */
function getClientIP(req) {
  // Try X-Forwarded-For header first (contains chain of IPs)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For format: client, proxy1, proxy2
    // The first IP is the original client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Try X-Real-IP header
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }

  // Fall back to req.ip (Express provides this)
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Get the full forwarded IP chain for logging
 * @param {Object} req - Express request object
 * @returns {Object} Object containing realIP and forwarded chain
 */
function getIPInfo(req) {
  const realIP = getClientIP(req);
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIPHeader = req.headers['x-real-ip'];

  return {
    realIP,
    forwardedFor,
    realIPHeader,
    isProxy: !!(forwardedFor || realIPHeader),
    userAgent: req.headers['user-agent']
  };
}

/**
 * Check if the IP appears to be from a known VPN/proxy range
 * This is a basic implementation - can be enhanced with VPN databases
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP might be VPN/proxy
 */
function isLikelyVPN(ip) {
  // Basic check for private ranges and common proxy characteristics
  if (!ip || ip === 'unknown') return false;
  
  // Check for private IP ranges (these might indicate internal proxy)
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./
  ];
  
  return privateRanges.some(range => range.test(ip));
}

module.exports = {
  getClientIP,
  getIPInfo,
  isLikelyVPN
};
