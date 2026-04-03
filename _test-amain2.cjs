const q = process.argv[2] || 'kyosho mr04 evo2';
console.log('Searching for:', q);

const brUrl = 'https://core.dxpapi.com/api/v1/core/?account_id=7300&domain_key=amainhobbies&request_type=search&q=' + encodeURIComponent(q) + '&fl=pid,title,price,thumb_image,url,brand,availability,description&rows=5&start=0&search_type=keyword';
fetch(brUrl)
  .then(r => r.json())
  .then(d => {
    console.log(JSON.stringify(d, null, 2).slice(0, 5000));
  })
  .catch(e => console.error('Error:', e.message));
