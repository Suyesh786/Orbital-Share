const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/logo/airspace-tray-icon-template.png')
  .pipe(new PNG({ filterType: 4 }))
  .on('parsed', function() {
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) {
        const idx = (this.width * y + x) << 2;
        const alpha = this.data[idx + 3];
        if (alpha > 128) row += '#';
        else row += ' ';
      }
      console.log(row);
    }
  });
