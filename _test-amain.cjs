const q = process.argv[2] || 'kyosho mr04 evo2';
console.log('Searching for:', q);

const brUrl = 'https://core.dxpapi.com/api/v1/core/?account_id=7300&domain_key=amainhobbies&request_type=search&q=' + encodeURIComponent(q) + '&fl=pid,title,price,thumb_image,url,brand,availability,description&rows=5&start=0&search_type=keyword';
fetch(brUrl)
  .then(r => r.json())
  .then(d => {
    console.log('Total found:', d.response?.numFound);
    if (d.response?.docs?.[0]) {
      console.log('\nFull first result:');
      console.log(JSON.stringify(d.response.docs[0], null, 2));
    }
    console.log('\nAll available fields in first doc:', Object.keys(d.response?.docs?.[0] || {}));
  })
  .catch(e => console.error('Error:', e.message));

// Test 1: POST with search field
console.log('\n--- Test 1: POST body search= ---');
fetch('https://www.amainhobbies.com/boxes/search-results/load-page', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: 'search=' + encodeURIComponent(q) + '&page=1&sort=7',
})
  .then(r => r.json())
  .then(d => printResults('Test 1', d.resultsHtml))
  .catch(e => console.error('Test 1 error:', e.message));

// Test 2: POST with s= field  
console.log('\n--- Test 2: POST body s= ---');
fetch('https://www.amainhobbies.com/boxes/search-results/load-page', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: 's=' + encodeURIComponent(q) + '&page=1&sort=7',
})
  .then(r => r.json())
  .then(d => printResults('Test 2', d.resultsHtml))
  .catch(e => console.error('Test 2 error:', e.message));

// Test 3: GET with query params
console.log('\n--- Test 3: GET ?search= ---');
fetch('https://www.amainhobbies.com/boxes/search-results/load-page?search=' + encodeURIComponent(q) + '&page=1&sort=7', {
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})
  .then(r => r.json())
  .then(d => printResults('Test 3', d.resultsHtml))
  .catch(e => console.error('Test 3 error:', e.message));

// Test 4: POST with Referer from search page
console.log('\n--- Test 4: POST with Referer ---');
fetch('https://www.amainhobbies.com/boxes/search-results/load-page', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://www.amainhobbies.com/search?s=' + encodeURIComponent(q),
  },
  body: 'search=' + encodeURIComponent(q) + '&page=1&sort=7&searchType=0',
})
  .then(r => r.json())
  .then(d => printResults('Test 4', d.resultsHtml))
  .catch(e => console.error('Test 4 error:', e.message));

// Test 5: POST with cookie from search page
console.log('\n--- Test 5: Fetch search page first, then POST ---');
fetch('https://www.amainhobbies.com/search?s=' + encodeURIComponent(q))
  .then(r => {
    const cookies = r.headers.getSetCookie?.() || [];
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Cookies from search page:', cookieStr.slice(0, 100));
    return fetch('https://www.amainhobbies.com/boxes/search-results/load-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieStr,
        'Referer': 'https://www.amainhobbies.com/search?s=' + encodeURIComponent(q),
      },
      body: 'search=' + encodeURIComponent(q) + '&page=1&sort=7',
    });
  })
  .then(r => r.json())
  .then(d => printResults('Test 5', d.resultsHtml))
  .catch(e => console.error('Test 5 error:', e.message));

function printResults(label, html) {
  const re = /data-name="([^"]*)"/g;
  let m;
  let i = 0;
  while ((m = re.exec(html)) && i < 3) {
    i++;
    console.log(label, i + '.', m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 80));
  }
  console.log(label, 'total:', (html.match(/listing-product-card/g) || []).length);
}
