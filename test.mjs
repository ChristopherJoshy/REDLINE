import puppeteer from 'puppeteer-core';
import * as chromeLauncher from 'chrome-launcher';

(async () => {
  const chrome = await chromeLauncher.launch({chromeFlags: ['--headless']});
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:' + chrome.port
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('CRASH_ERROR:', err.message));
  page.on('requestfailed', request => console.log('REQ_FAILED:', request.url(), request.failure().errorText));
  page.on('response', response => {
      if(response.url().includes('/api/')) {
          console.log('API_RESPONSE:', response.url(), response.status());
      }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('redline_identity', JSON.stringify({teamId: 'TEAM_TEST', displayName: 'Test User', teamName: 'Test', elo: 1000}));
    localStorage.setItem('redline_session_token', 'VEVBTV9URVNU.VGVzdCBVc2Vy.d8605f6cd463bad41e968df997ca3924f5fad70e923ca9e4039ea4192e918518');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
  chrome.kill();
})();
