import { callAiFunction } from '../../lib/aiFunctionClient'

export async function callBlogAi(action, params = {}) {
  return callAiFunction('blog-ai', action, params)
}
