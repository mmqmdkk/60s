import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceBili {
  handle(): RouterMiddleware<'/bili'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `B站实时热搜\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}`)
            .slice(0, 20)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# B站实时热搜\n\n${data
            .slice(0, 20)
            .map((e, i) => `${i + 1}. [${e.title}](${e.link})`)
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<Item[]> {
    try {
      return await this.#fetchOfficial()
    } catch {
      return await this.#fetchAa1()
    }
  }

  async #fetchOfficial(): Promise<Item[]> {
    const headers: Record<string, string> = {
      'User-Agent': Common.chromeUA,
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com',
    }

    try {
      const spiResponse = await fetch('https://api.bilibili.com/x/frontend/finger/spi', { headers })
      const spi = await spiResponse.json()
      const b3 = spi?.data?.b_3
      const b4 = spi?.data?.b_4
      if (b3 && b4) {
        headers.Cookie = `buvid3=${b3}; buvid4=${b4}`
      }
    } catch {
      // 忽略访客 Cookie 获取失败，继续尝试公开接口。
    }

    const apis = [
      'https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50',
      'https://app.bilibili.com/x/v2/search/trending/ranking?limit=50',
      'https://s.search.bilibili.com/main/hotword',
    ]

    for (const api of apis) {
      try {
        const response = await fetch(api, { headers })
        if (!response.ok) {
          continue
        }
        const payload = await response.json()
        const list = payload?.data?.trending?.list ?? payload?.data?.list ?? payload?.list
        const normalized = this.#normalize(list)
        if (normalized.length > 0) {
          return normalized
        }
      } catch {
        // 尝试下一个 B 站官方端点。
      }
    }

    throw new Error('Bilibili official endpoints returned no usable data')
  }

  async #fetchAa1(): Promise<Item[]> {
    const response = await fetch('https://v.api.aa1.cn/api/bilibili-rs/')
    if (!response.ok) {
      throw new Error(`Aa1 Bilibili API returned HTTP ${response.status}`)
    }

    const payload = await response.json()
    const normalized = this.#normalize(payload?.data)
    if (normalized.length === 0) {
      throw new Error('Aa1 Bilibili API returned no usable data')
    }
    return normalized
  }

  #normalize(list: unknown): Item[] {
    if (!Array.isArray(list)) {
      return []
    }

    return list
      .map((item: any) => {
        const title = String(item?.keyword || item?.show_name || item?.title || item?.word || '').trim()
        const rawLink = String(item?.link || item?.url || '').trim()
        const link =
          rawLink ||
          (title ? `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}` : '')

        return {
          title,
          link,
          hot: String(item?.hot_value || item?.hot || item?.heat || ''),
        }
      })
      .filter((item) => item.title)
  }
}

export const serviceBili = new ServiceBili()

interface Item {
  title: string
  link: string
  hot?: string
}
