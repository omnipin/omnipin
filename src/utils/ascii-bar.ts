/*
MIT License

Copyright (c) 2020 superjojo140
*/

export class AsciiBar {
  /**
   * Format of the displayed progressbar
   */
  public formatString = '#spinner #bar #message'

  /**
   * Number of steps to finish progress
   */
  public total = 100

  /**
   * Startdate to calculate elapsed time (in milliseconds)
   */
  public startDate = Date.now()

  /**
   * Which timespan to use for timing calculation - If you are unsure allways use false here!
   */
  public lastUpdateForTiming = false

  /**
   * Width of the progress bar (only the #bar part)
   */
  public width = 20

  /**
   * Symbol for the done progress in the #bar part
   */
  public doneSymbol = '>'

  /**
   * Symbol for the undone progress in the #bar part
   */
  public undoneSymbol = '-'

  /**
   * Wether to print to configured stream or not
   */
  public print = true

  /**
   * A spinner object describing how the spinner looks like
   * Change this for another spinner
   */
  public spinner = defaultSpinner

  /**
   * The message displayed at the #message placeholder
   */
  public message = ''

  /**
   * wether to call progressbar's stop() function automatically if the progress reaches 100%
   */
  public autoStop = true

  /**
   * wether to hide the terminal's cursor while displaying the progress bar
   */
  public hideCursor = false

  private elapsed = 0
  private lastUpdate = Date.now()

  private overallTime = 0
  private stream = process.stdout
  private spinnerTimeout
  private enableSpinner = false
  private currentSpinnerSymbol = ''
  private current = 0

  constructor(options?: string | ProgressbarOptions) {
    if (options) {
      //if only a string was provided, use this as formatString
      if (typeof options === 'string') {
        options = { formatString: options }
      }

      //set other options
      for (const opt in options) {
        if (this[opt] !== undefined) {
          this[opt] = options[opt]
        }
      }

      //use simple spinner on windows
      if (process.platform === 'win32') {
        this.spinner = simpleSpinner
      }

      //enable spinner
      if (this.enableSpinner) {
        this.spinnerTimeout = setTimeout(
          this.updateSpinner,
          this.spinner.interval,
        )
      }
    }
  }

  /**
   * Creates the progressbar string with all configured settings
   * @returns a string representating the progressbar
   */
  public renderLine(): string {
    const plusCount = Math.round((this.current / this.total) * this.width)
    const minusCount = this.width - plusCount
    let plusString = ''
    let minusString = ''
    for (let i = 0; i < plusCount; i++) {
      plusString += this.doneSymbol
    }
    for (let i = 0; i < minusCount; i++) {
      minusString += this.undoneSymbol
    }
    const barString = `[${plusString}${minusString}]`

    let currentString = String(this.current)
    while (currentString.length < String(this.total).length) {
      currentString = `0${currentString}`
    }

    //Replace macros
    let line = this.formatString
      .replace(/#bar/g, barString)
      .replace(/#message/g, this.message)
      .replace(/#spinner/g, this.currentSpinnerSymbol)

    line += colorCodes.Reset

    //Hide cursor
    if (this.hideCursor) {
      line = colorCodes.HideCursor + line
    }

    return line
  }

  /**
   * Render the progressbar and print it to output stream
   */
  public printLine(): void {
    if (!this.print) {
      return
    }
    this.stream.cursorTo(0)
    this.stream.write(this.renderLine())
    this.stream.clearLine(1)
  }

  update(current: number, message?: string) {
    this.current = current

    if (message) {
      this.message = message
    }

    //timePerTick * max = overallTime
    //timePerTick = elapsed / current
    //overallTime = (elapsed / current) * max
    //timeToFinish = overallTime - elapsed
    const now = Date.now()
    //how to calculate time per step
    const timePerStep = this.lastUpdateForTiming
      ? now - this.lastUpdate
      : this.elapsed / this.current
    this.elapsed = now - this.startDate
    this.overallTime = timePerStep * this.total

    this.printLine()

    //Stop if finished
    if (this.autoStop && this.current / this.total >= 1) {
      this.stop()
    }

    this.lastUpdate = now
    return this
  }

  /**
   * Updates the spinner if enabled
   */
  private updateSpinner = () => {
    if (this.spinner.currentFrame === undefined) {
      this.spinner.currentFrame = 0
    }
    this.spinner.currentFrame =
      (this.spinner.currentFrame + 1) % this.spinner.frames.length
    this.currentSpinnerSymbol = this.spinner.frames[this.spinner.currentFrame]
    this.printLine()
    this.spinnerTimeout = setTimeout(this.updateSpinner, this.spinner.interval)
  }

  /**
   * Formats a time span (given in milliseconds) to a easy human readable string
   * @param millis timespan in milliseconds
   */
  private formatTime(millis: number): string {
    //Milliseconds
    if (millis < 500) {
      return `${Math.round(millis)}ms`
    }
    //Seconds
    if (millis < 60 * 1000) {
      return `${Math.round(millis / 1000)}s`
    }
    //Minutes
    if (millis < 60 * 60 * 1000) {
      const minutes = Math.round(millis / (1000 * 60))
      const seconds = Math.round((millis % (1000 * 60)) / 1000)
      return `${minutes}m ${seconds}s`
    }

    const hours = Math.round(millis / (1000 * 60 * 60))
    const minutes = Math.round((millis % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  /**
   * Stop the progressbar
   * This will stop the spinner and change it's symbol to a checkmark (if not disabled)
   * Message will be changed to a string describing the elapsed time (if not disabled)
   * This function will be triggered automatically if the progressbar reaches 100% (if not disabled)
   * @param withInfo wether to auto-update the progressbar's spinner and message after stopping
   */
  public stop(withInfo = true) {
    //Stop the spinner
    if (this.spinnerTimeout) {
      clearTimeout(this.spinnerTimeout)
    }

    if (withInfo) {
      //change spinner to checkmark
      this.currentSpinnerSymbol = `${colorCodes.Green + colorCodes.Bright}✓${colorCodes.Reset}`
      if (process.platform === 'win32') {
        this.currentSpinnerSymbol = 'OK '
      }
      //set overalltime to really elapsed time
      this.overallTime = this.elapsed
      this.message = `Finished in ${this.formatTime(this.overallTime)}`
      this.printLine()
    }

    //add newline and re-enable cursor
    console.log(this.hideCursor ? colorCodes.ShowCursor : '')
  }
}

interface ProgressbarOptions {
  /**
   * Format of the displayed progressbar
   * Use serveral of this placeholders:
   * #bar #count #percent #overall #elapsed #ttf #message #spinner
   * And combine with serveral of this formatters:
   * ##default ##green ##blue ##red ##yellow ##bright ##dim
   * @default '#percent #bar'
   * @example '##bright##blue#spinner##default #percent #bar Elapsed: #elapsed Time to finish: #ttf  #message'
   */

  formatString?: string

  /**
   * Number of steps to finish progress
   * @default 100
   */
  total?: number

  /**
   * Startdate to calculate elapsed time (in milliseconds)
   * Use this if the progress started before initialising the progressbar
   * @default 'new Date().getTime()'
   */
  startDate?: number

  /**
   * Stream to print the progressbar
   * @default process.stdout
   */
  stream?: NodeJS.ReadWriteStream

  /**
   * Width of the progress bar (only the #bar part)
   * @default 20
   */
  width?: number

  /**
   * Symbol for the done progress in the #bar part
   * @default '>'
   */
  doneSymbol?: string

  /**
   * Symbol for the undone progress in the #bar part
   * @default '-'
   */
  undoneSymbol?: string

  /**
   * Wether to print to configured stream or not
   * If set to false get the currently rendered statusbar with bar.renderLine()
   * @default true
   */
  print?: boolean

  /**
   * Start value of progress
   * @default 0
   */
  start?: number

  /**
   * Wether to enable the spinner update function or not.
   * If enabled the statusbar will re-render automatically every few seconds to update the spinner symbol
   * Make sure to include #spinner in formatString to use spinner symbol
   * @default false
   */
  enableSpinner?: boolean

  /**
   * Which timespan to use for timing calculation - If you are unsure allways use false here!
   * set to FALSE: Assume that each of the remaining steps will take as long as THE AVERAGE OF ALL the previous steps
   * set to TRUE: Assume that eah of the remaining steps will take as long as THE LAST STEP took. WARNING: This implies, that every call of the ProgressBar.update() function increment the state with the same stepwidth.
   * @default false using overall elapsed time for timing calculation
   */
  lastUpdateForTiming?: boolean

  /**
   * wether to call progressbar's stop() function automatically if the progress reaches 100%
   * @default true
   */
  autoStop?: boolean

  /**
   * wether to hide the terminal's cursor while displaying the progress bar
   * cursor will be re-enabled by the bar.stop() function
   * @default false
   */
  hideCursor?: boolean
}

//ColorCodes from https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const colorCodes = {
  Reset: '\x1b[0m',
  Dim: '\x1b[2m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',

  Green: '\x1b[32m',

  HideCursor: '\x1B[?25l',
  ShowCursor: '\x1B[?25h',
}

export const defaultSpinner: Spinner = {
  interval: 120,
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
}

export const simpleSpinner: Spinner = {
  interval: 120,
  frames: ['-', '\\', '|', '/'],
}

interface Spinner {
  /**
   * Number of milliseconds to update to the next spinner frame
   */
  interval: number

  /**
   * Array of the spinner "frames"
   * A frame means one char
   */
  frames: string[]

  /**
   * Used in runtime to store currently displayed frame
   * @default 0
   */
  currentFrame?: number
}
