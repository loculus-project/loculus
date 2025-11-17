import { expect } from '@playwright/test';

let patched = false;
let originalClick: any;
const DEBUG = process.env.DEBUG_SAFE_CLICK === 'true';

export function patchLocatorClick() {
  if (patched) return;

  try {
    // Search through require.cache to find the Locator class
    let LocatorImpl: any;

    for (const moduleId of Object.keys(require.cache)) {
      if (moduleId.includes('playwright-core') && moduleId.includes('locator.js')) {
        const module = require.cache[moduleId];
        if (module && module.exports && module.exports.Locator) {
          const Locator = module.exports.Locator;
          // Check if click method exists (use 'in' operator for non-enumerable properties)
          if (Locator.prototype && 'click' in Locator.prototype) {
            LocatorImpl = Locator;
            break;
          }
        }
      }
    }

    if (!LocatorImpl) {
      // Locator might not be loaded yet
      if (DEBUG) console.log('[safe-click] Locator class not found in require.cache yet');
      return;
    }

    // Store original click method
    originalClick = LocatorImpl.prototype.click;

    if (DEBUG) console.log('[safe-click] ✓ Successfully patched Locator.prototype.click');

    // Override with our safe click
    LocatorImpl.prototype.click = async function(options) {
      if (DEBUG) {
        try {
          const selector = this.toString();
          console.log(`[safe-click] Clicking: ${selector}`);
        } catch {
          console.log('[safe-click] Clicking: (unknown selector)');
        }
      }

      // Wait for element to be visible
      await this.waitFor({ state: 'visible' });
      if (DEBUG) console.log('[safe-click]   ✓ Element is visible');

      // For links: wait for href to be populated (React hydration)
      const tagName = await this.evaluate((el: Element) => el.tagName.toLowerCase())
        .catch(() => null);

      if (tagName === 'a') {
        if (DEBUG) console.log('[safe-click]   Link detected, waiting for href...');
        await expect(this).toHaveAttribute('href', /.+/);
        if (DEBUG) console.log('[safe-click]   ✓ Link href is populated');
      }

      // Call original click with all built-in safety checks
      await originalClick.call(this, options);
      if (DEBUG) console.log('[safe-click]   ✓ Click completed');
    };

    patched = true;
  } catch (error) {
    if (DEBUG) console.log('[safe-click] Failed to patch:', error);
    // Silently fail - patching will be retried
  }
}

// Try to patch immediately
patchLocatorClick();

// Also try to patch after a short delay (when more modules are loaded)
setTimeout(patchLocatorClick, 100);
