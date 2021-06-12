import fetch from 'node-fetch'
import Config from './config'

export async function selectPaper({
  accessToken,
  userId,
  paperId,
}: {
  accessToken: string
  userId: string
  paperId: string
}): Promise<{ canViewerWritePaper: boolean }> {
  const result = await fetch(Config.shared.paperGraphqlUri, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query Paper($userId: String!, $paperId: String!) {
          user(identifier: {id: $userId}) {
            paper(paperId: $paperId) {
              canViewerWritePaper
            }
          }
        }
      `,
      variables: { userId, paperId },
    }),
  })

  const json = await result.json()
  if (json.errors?.[0]) {
    throw new Error(json.errors[0].message)
  }
  const paper = json.data?.user?.paper
  if (!paper) {
    throw new Error(`Query paper failed`)
  }

  return json.data.user.paper
}
