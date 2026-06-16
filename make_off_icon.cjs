const fs = require('fs');
const PNG = require('pngjs').PNG;

fs.createReadStream('src/assets/logo/airspace-tray-icon-template.png')
  .pipe(new PNG({ filterType: 4 }))
  .on('parsed', function() {
    const width = this.width;
    const height = this.height;
    
    // Find bounding box of visible pixels
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
    
    // If empty image, fallback to full size
    if (minX > maxX) { minX = 0; maxX = width; minY = 0; maxY = height; }
    
    const w = maxX - minX;
    const h = maxY - minY;
    
    // The slash goes from top-left to bottom-right of the bounding box
    // Equation of this line: (y - minY) / h = (x - minX) / w
    // Or: (y - minY)*w - (x - minX)*h = 0
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        
        // distance to the center line of the slash
        // We use a simple perpendicular distance approximation
        const dx = x - minX;
        const dy = y - minY;
        const lineEq = Math.abs(dy * w - dx * h) / Math.sqrt(w*w + h*h);
        
        // Thicknesses relative to the icon size
        const lineThickness = w * 0.055;
        const borderThickness = w * 0.055;
        
        // Let the slash extend slightly past the bounding box
        const pad = w * 0.1;
        const inBounds = (x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad);
        
        if (inBounds) {
            if (lineEq < lineThickness) {
                // Solid white line
                this.data[idx] = 255;
                this.data[idx + 1] = 255;
                this.data[idx + 2] = 255;
                this.data[idx + 3] = 255;
            } else if (lineEq < lineThickness + borderThickness) {
                // Transparent border/cutout
                this.data[idx + 3] = 0;
            }
        }
      }
    }
    
    this.pack().pipe(fs.createWriteStream('src/assets/logo/airspace-tray-icon-off-template.png'));
    console.log("Created matched slashed icon!");
  });
