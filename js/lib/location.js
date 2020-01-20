var url = location.pathname.slice(1) // slice past the '/'
if (url && url.startsWith('hd://')) {
  // remove the 'hd://'
  history.replaceState(undefined, document.title, window.location.origin + '/' + url.slice('hd://'.length))
} else if (!url && navigator.filesystem) {
  window.location = `/${navigator.filesystem.url.slice('hd://'.length)}`
} else {
  url = 'hd://' + url
}
var urlp
try {
  urlp = new URL(url)
} catch (e) {
  urlp = {hostname: undefined, pathname: undefined}
}

export function getUrl () {
  return url || undefined
}

export function setUrl (url) {
  window.location = `/${url.replace(/^hd:\/\//, '')}`
}

export function setPath (path) {
  urlp.pathname = path
  setUrl(urlp.toString())
}

export function openUrl (url) {
  window.open(`${window.location.origin}/${url.replace(/^hd:\/\//, '')}`)
}

export function getOrigin () {
  return urlp.origin
}

export function getHostname () {
  return urlp.hostname
}

export function getPath () {
  return urlp.pathname
}