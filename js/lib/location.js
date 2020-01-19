var url = location.pathname.slice(1) // slice past the '/'
if (url && url.startsWith('drive://')) {
  // remove the 'drive://'
  history.replaceState(undefined, document.title, window.location.origin + '/' + url.slice('drive://'.length))
} else {
  url = 'drive://' + url
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
  window.location = `/${url.replace(/^drive:\/\//, '')}`
}

export function openUrl (url) {
  window.open(`${window.location.origin}/${url.replace(/^drive:\/\//, '')}`)
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