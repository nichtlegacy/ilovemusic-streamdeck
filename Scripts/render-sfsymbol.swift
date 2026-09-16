import AppKit

// Usage: swift /tmp/render-sfsymbol.swift <symbol> <pointSize> <pixelSize> <outputPath>
let args = CommandLine.arguments
guard args.count == 5,
      let pointSize = Double(args[2]),
      let pixelSize = Int(args[3]) else {
  fputs("usage: render-sfsymbol.swift <symbol> <pointSize> <pixelSize> <outPath>\n", stderr)
  exit(1)
}
let symbolName = args[1]
let outPath = args[4]

guard let symbol = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil) else {
  fputs("symbol not found: \(symbolName)\n", stderr)
  exit(2)
}

let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
guard let configured = symbol.withSymbolConfiguration(config) else {
  fputs("config failed\n", stderr)
  exit(3)
}

// Force a 1x bitmap at exact pixel dimensions (no Retina scaling).
let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: pixelSize,
  pixelsHigh: pixelSize,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
)!
bitmap.size = NSSize(width: pixelSize, height: pixelSize)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize).fill()

let imageSize = configured.size
let x = (Double(pixelSize) - imageSize.width) / 2
let y = (Double(pixelSize) - imageSize.height) / 2
let rect = NSRect(x: x, y: y, width: imageSize.width, height: imageSize.height)

// Draw the symbol then tint to white via sourceAtop.
configured.draw(in: rect, from: NSRect(origin: .zero, size: configured.size), operation: .sourceOver, fraction: 1.0)
NSColor.white.set()
rect.fill(using: .sourceAtop)

NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fputs("encode failed\n", stderr)
  exit(4)
}
try png.write(to: URL(fileURLWithPath: outPath))
print("wrote \(outPath) (\(png.count) bytes)")
