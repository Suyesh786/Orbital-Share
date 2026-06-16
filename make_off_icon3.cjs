const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/logo/airspace-tray-icon-template.png')
  .pipe(new PNG({ filterType: 4 }))
  .on('parsed', function() {
    const width = this.width;
    const height = this.height;
    
    // Find bounding box
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        if (this.data[idx + 3] > 10) {
           if (x < minX) minX = x;
           if (x > maxX) maxX = x;
           if (y < minY) minY = y;
           if (y > maxY) maxY = y;
        }
      }
    }
    
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = maxX - minX;
    
    // Slash parameters
    const lineThickness = w * 0.055;
    const borderThickness = w * 0.06;
    const slashLength = w * 0.5; // Radius from center
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        
        // Distance to 45-degree line y - cy = x - cx
        // Which is x - y - cx + cy = 0
        const dLine = Math.abs(x - y - cx + cy) / Math.SQRT2;
        
        // Distance to center
        const dCenter = Math.sqrt((x - cx)**2 + (y - cy)**2);
        
        if (dCenter <= slashLength) {
            if (dLine < lineThickness) {
                // Solid white line
                this.data[idx] = 255;
                this.data[idx + 1] = 255;
                this.data[idx + 2] = 255;
                this.data[idx + 3] = 255;
            } else if (dLine < lineThickness + borderThickness) {
                // Cutout border
                this.data[idx + 3] = 0;
            }
        }
      }
    }
    
    this.pack().pipe(fs.createWriteStream('src/assets/logo/airspace-tray-icon-off-template.png'));
  });
