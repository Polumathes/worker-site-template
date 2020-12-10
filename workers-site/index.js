/* eslint-disable no-unused-vars */
import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
import {
  handleOptionsRequest,
  handleActiveCampaignRequest,
} from '../utils/activecampaign'

/**
 * The DEBUG flag will do two things that help during development:
 * 1. we will skip caching on the edge, which makes it easier to
 *    debug.
 * 2. we will return an error message on exception in your Response rather
 *    than the default 404.html page.
 */
const DEBUG = false

addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  try {
    if (url.pathname.startsWith('/ac/')) {
      if (request.method === 'OPTIONS') {
        event.respondWith(handleOptionsRequest(request))
      } else if (
        request.method === 'GET' ||
        request.method === 'HEAD' ||
        request.method === 'POST' ||
        request.method === 'PUT'
      ) {
        event.respondWith(handleActiveCampaignRequest(request))
      }
    } else {
      event.respondWith(handleEvent(event))
    }
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 500,
        })
      )
    }
    event.respondWith(
      new Response('Internal Error', {
        status: 500,
      })
    )
  }
})

async function handleEvent(event) {
  const { protocol, hostname, pathname, ...url } = new URL(event.request.url)

  if (protocol === 'http:') {
    return Response.redirect(`https://${hostname + pathname}`, 301)
  }

  const options = {}

  const headers = {
    'Content-Security-Policy': [
      "default-src 'none';",
      "script-src 'unsafe-inline' 'self' https://cdn.jsdelivr.net;",
      "object-src 'none';",
      "style-src 'unsafe-inline' 'self';",
      "img-src 'self' data:;",
      'media-src;',
      'frame-src;',
      "font-src 'self';",
      "connect-src 'self';",
      "manifest-src 'self';",
      'upgrade-insecure-requests;',
    ].join(''),
    'Strict-Transport-Security': 'max-age=1000',
    'Cache-Control': 'public, max-age=31536000, immutabe',
    'X-Xss-Protection': '1; mode=block',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  try {
    if (DEBUG) {
      // customize caching
      options.cacheControl = {
        bypassCache: true,
      }
    }

    let response = await getAssetFromKV(event, options)

    // Make headers mutable by reconstructing the response
    response = new Response(response.body, response)
    Object.keys(headers).forEach((header) =>
      response.headers.set(header, headers[header])
    )

    return response
  } catch (e) {
    // Fall back to serving `/index.html` on errors.
    let response = getAssetFromKV(event, {
      mapRequestToAsset: (req) =>
        new Request(`${new URL(req.url).origin}/index.html`, req),
    })

    // Make headers mutable by reconstructing the response
    response = new Response(response.body, response)
    Object.keys(headers).forEach((header) =>
      response.headers.set(header, headers[header])
    )

    return getAssetFromKV(event, {
      mapRequestToAsset: (req) =>
        new Request(`${new URL(req.url).origin}/index.html`, req),
    })
  }
}

/**
 * Here's one example of how to modify a request to
 * remove a specific prefix, in this case `/docs` from
 * the url. This can be useful if you are deploying to a
 * route on a zone, or if you only want your static content
 * to exist at a specific path.
 */
function handlePrefix(prefix) {
  return (request) => {
    // compute the default (e.g. / -> index.html)
    const defaultAssetKey = mapRequestToAsset(request)
    const url = new URL(defaultAssetKey.url)

    // strip the prefix from the path for lookup
    url.pathname = url.pathname.replace(prefix, '/')

    // inherit all other props from the default request
    return new Request(url.toString(), defaultAssetKey)
  }
}
