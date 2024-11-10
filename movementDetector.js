class MovementDetector {
  constructor(config = {}) {
    if (!config.callback) {
      throw new Error('Callback function is required');
    }
    this.callback = config.callback;

    // Check if we are in the browser environment
    if (!window || !document || !navigator) {
      throw new Error('MovementDetector must be used in the browser environment');
    }

    // How often to check movement (take picture) in milliseconds.
    this.takePictureIntervalMs = config.takePictureIntervalMs || 1000

    // Width of the video element.
    const width = config.width || 320
    this.width = width
    
    // Height of the video element. 
    const height = config.height || 240
    this.height = height

    // How big part of image should change to trigger movement. 0.1 means 10% of the pixels have to be significantly changed (not camera noise) to trigger movement. Possible values are 0 - 1.
    const imageThreshold = config.threshold || 0.1
    if (imageThreshold < 0 || imageThreshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.imageThreshold = imageThreshold
    this._imageThresholdPixels = Math.floor(width * height * this.imageThreshold)

    // Filters camera noise, possible values are 0 - 255. 30 means that if average difference of RGB channels is more than 30, then it is considered as movement.
    const pixelThreshold = config.pixelThreshold || 30
    if (pixelThreshold < 0 || pixelThreshold > 255) {
      throw new Error('Pixel threshold must be between 0 and 255');
    }
    this.pixelThreshold = pixelThreshold

    // videoElement is the <video> element with stream from the camera. If not provided, stream from webcam will be used
    const videoElement = config.videoElement || document.createElement('video')
    this.videoElement = videoElement

    // This library can launch webcam automatically if the video element is not provided
    if (config.shouldLaunchWebcam === true) { 
      navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
          videoElement.srcObject = stream;
          videoElement.play();
        })
        .catch((err) => {
          console.error(`An error occurred: ${err}`);
        })
    }

    this.prevImgElement = config.prevImgElement || document.createElement('img')
    this.currImgElement = config.currImgElement || document.createElement('img')
    this.diffImgElement = config.diffImgElement || document.createElement('img')

    if (!this.videoElement || !this.prevImgElement || !this.currImgElement || !this.diffImgElement) {
      throw new Error('Check movementDetector.js code. All elements should be provided');
    }

    this.videoElement.setAttribute("width", width)
    this.videoElement.setAttribute("height", height)

    // Generate internal canvases for difference images and screenshot taking

    const _canvasElement = document.createElement('canvas')
    _canvasElement.width = width
    _canvasElement.height = height
    this._canvasElement = _canvasElement

    const _diffCanvas = document.createElement('canvas')
    _diffCanvas.width = width;
    _diffCanvas.height = height;
    this._diffCanvas = _diffCanvas

    const filteredDiffCanvas = document.createElement('canvas')
    filteredDiffCanvas.width = width;
    filteredDiffCanvas.height = height;
    this._filteredDiffCanvas = filteredDiffCanvas

    this._isStreaming = false;
  }

  start() {   
    const video = this.videoElement

    video.addEventListener(
      "canplay",
      (ev) => {
        if (!this._isStreaming) {
          this._isStreaming = true;
          if (this.takePictureIntervalMs > 0) {
            setInterval(() => this.takeNextPictureAndDetectMovement(), this.takePictureIntervalMs);
          }
        }
      },
    )

  }

  takeNextPictureAndDetectMovement() {
    const { videoElement, _canvasElement, width, height, prevImgElement, currImgElement } = this;
    
    // Move current image to previous
    const currentSrc = currImgElement.getAttribute("src");
    if (currentSrc) {
      prevImgElement.setAttribute("src", currentSrc);
    }
    
    // Take new screenshot
    const ctx = _canvasElement.getContext("2d");
    ctx.drawImage(videoElement, 0, 0, width, height);
    
    // Set as current image and wait for it to load
    const newImageSrc = _canvasElement.toDataURL("image/png");
    currImgElement.onload = () => this.compareImages();
    currImgElement.setAttribute("src", newImageSrc);
  }

  compareImages() {
    const { width, height, _diffCanvas, _imageThresholdPixels, pixelThreshold, callback, prevImgElement, currImgElement } = this

    const diffContext = _diffCanvas.getContext('2d');
    const currentSrc = currImgElement.getAttribute('src')

    if (!prevImgElement.complete || !currImgElement.complete) {
      return;
    }

    if (!prevImgElement.getAttribute('src') || !currImgElement.getAttribute('src')) {
      return;
    }

    // Get pixel data from both images
    diffContext.drawImage(prevImgElement, 0, 0);
    const img1Data = diffContext.getImageData(0, 0, width, height).data;
    
    diffContext.clearRect(0, 0, width, height);
    diffContext.drawImage(currImgElement, 0, 0);
    const img2Data = diffContext.getImageData(0, 0, width, height).data;
    
    // Create a new ImageData for the difference visualization
    const diffImageData = diffContext.createImageData(width, height)
    let changedPixels = 0;

    // Compare pixels and create difference image
    for (let i = 0; i < img1Data.length; i += 4) {
        const rDiff = Math.abs(img1Data[i] - img2Data[i])
        const gDiff = Math.abs(img1Data[i + 1] - img2Data[i + 1])
        const bDiff = Math.abs(img1Data[i + 2] - img2Data[i + 2])

        if ((rDiff + gDiff + bDiff) / 3 > pixelThreshold) {
            changedPixels++;
            diffImageData.data[i] = 255
            diffImageData.data[i + 1] = 0
            diffImageData.data[i + 2] = 0 
            diffImageData.data[i + 3] = 255
        } else {
            diffImageData.data[i] = 0
            diffImageData.data[i + 1] = 0
            diffImageData.data[i + 2] = 0
            diffImageData.data[i + 3] = 255
        }
    }

    // Put the difference image data to the canvas
    diffContext.putImageData(diffImageData, 0, 0)
    this.diffImgElement.setAttribute('src', _diffCanvas.toDataURL())

    if (changedPixels > _imageThresholdPixels) {
      callback(currentSrc)
    }
  } 
}

// Makes MovementDetector available globally
window.MovementDetector = MovementDetector 