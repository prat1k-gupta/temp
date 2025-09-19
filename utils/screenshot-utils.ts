import { toPng, toSvg } from "html-to-image"

export type ScreenshotFormat = "png" | "svg"

export interface ScreenshotOptions {
  format: ScreenshotFormat
  quality?: number
  backgroundColor?: string
  pixelRatio?: number
  includeBackground?: boolean
}

export interface ScreenshotResult {
  dataUrl: string
  blob?: Blob
  format: ScreenshotFormat
  size: { width: number; height: number }
}

/**
 * Capture a screenshot of the React Flow canvas
 */
export async function captureFlowScreenshot(
  element: HTMLElement,
  options: ScreenshotOptions
): Promise<ScreenshotResult> {
  const {
    format,
    quality = 1,
    backgroundColor = "#ffffff",
    pixelRatio = 2,
    includeBackground = true,
  } = options

  // Use the element directly (should be the React Flow component)
  const reactFlowElement = element
  
  // Get the dimensions of the React Flow element
  const elementRect = reactFlowElement.getBoundingClientRect()
  const canvasWidth = elementRect.width
  const canvasHeight = elementRect.height
  
  // Screenshot options following React Flow documentation pattern
  const screenshotOptions = {
    quality,
    pixelRatio,
    backgroundColor: includeBackground ? backgroundColor : "transparent",
    width: canvasWidth,
    height: canvasHeight,
    // Filter out controls and minimap as recommended by React Flow docs
    filter: (node: Element) => {
      return !(
        node?.classList?.contains('react-flow__minimap') ||
        node?.classList?.contains('react-flow__controls')
      )
    }
  }

  let dataUrl: string
  let blob: Blob | undefined

  try {
    switch (format) {
      case "png":
        dataUrl = await toPng(reactFlowElement, screenshotOptions)
        blob = await dataUrlToBlob(dataUrl)
        break
      case "svg":
        dataUrl = await toSvg(reactFlowElement, screenshotOptions)
        blob = await dataUrlToBlob(dataUrl)
        break
      default:
        throw new Error(`Unsupported format: ${format}`)
    }

    return {
      dataUrl,
      blob,
      format,
      size: { width: canvasWidth, height: canvasHeight },
    }
  } catch (error) {
    console.error("Screenshot capture failed:", error)
    throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Convert data URL to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}


/**
 * Download the screenshot
 */
export function downloadScreenshot(result: ScreenshotResult, filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const defaultFilename = `magic-flow-${timestamp}`
  
  let finalFilename = filename || defaultFilename
  let mimeType: string
  let extension: string

  switch (result.format) {
    case "png":
      extension = "png"
      mimeType = "image/png"
      break
    case "svg":
      extension = "svg"
      mimeType = "image/svg+xml"
      break
    default:
      throw new Error(`Unsupported format for download: ${result.format}`)
  }

  finalFilename = `${finalFilename}.${extension}`

  if (result.blob) {
    // Use blob for better performance
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement("a")
    link.href = url
    link.download = finalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } else {
    // Fallback to data URL
    const link = document.createElement("a")
    link.href = result.dataUrl
    link.download = finalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

/**
 * Copy screenshot to clipboard
 */
export async function copyScreenshotToClipboard(result: ScreenshotResult): Promise<void> {
  if (result.blob) {
    // For image formats, copy as image
    const clipboardItem = new ClipboardItem({
      [result.blob.type]: result.blob,
    })
    await navigator.clipboard.write([clipboardItem])
  } else {
    // Fallback to text
    await navigator.clipboard.writeText(result.dataUrl)
  }
}

/**
 * Simple download function following React Flow documentation pattern
 */
export async function downloadFlowAsImage(
  element: HTMLElement,
  format: "png" | "svg" = "png",
  filename?: string
): Promise<void> {
  try {
    const filter = (node: Element) => {
      return !(
        node?.classList?.contains('react-flow__minimap') ||
        node?.classList?.contains('react-flow__controls')
      )
    }

    let dataUrl: string
    if (format === "png") {
      dataUrl = await toPng(element, { filter })
    } else {
      dataUrl = await toSvg(element, { filter })
    }

    const link = document.createElement('a')
    link.setAttribute('download', filename || `reactflow.${format}`)
    link.setAttribute('href', dataUrl)
    link.click()
  } catch (error) {
    console.error('Error downloading image:', error)
    throw error
  }
}
