import { Octokit } from 'octokit'
import { debug, getInput, info, setFailed } from '@actions/core'
import dotenv from 'dotenv'

dotenv.config()

type Delivery = {
  id: number
  guid: string
  delivered_at: string
  redelivery: boolean
  duration: number
  status: string
  status_code: number
  event: string
  action: string | null
  installation_id: number | null
  repository_id: number | null
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const token = getInput('token') || process.env.TOKEN
    const owner =
      getInput('repository').split('/')[0] ||
      process.env.GITHUB_REPOSITORY?.split('/')[0]
    const repo =
      getInput('repository').split('/')[1] ||
      process.env.GITHUB_REPOSITORY?.split('/')[1]
    const webhookId = getInput('webhook_id') || process.env.WEBHOOK_ID
    const lastRedeliveryVariable =
      getInput('last_redelivery_variable_name') ||
      process.env.LAST_REDELIVERY_VARIABLE_NAME

    debug(`owner: ${owner}`)
    debug(`repo: ${repo}`)
    debug(`webhookId: ${webhookId}`)
    debug(`lastRedeliveryVariable: ${lastRedeliveryVariable}`)

    if (!token) throw new Error('No token provided')
    if (!owner) throw new Error('No owner provided')
    if (!repo) throw new Error('No repo provided')
    if (!lastRedeliveryVariable)
      throw new Error('No lastRedeliveryVariable provided')

    const octokit = new Octokit({ auth: token })
    const webhooks = webhookId
      ? [
          (
            await octokit.rest.repos.getWebhook({
              owner,
              repo,
              hook_id: Number(webhookId)
            })
          ).data
        ]
      : (await octokit.rest.repos.listWebhooks({ owner, repo })).data

    const lastStoredRedeliveryTime = await getVariable(
      lastRedeliveryVariable,
      owner,
      repo,
      octokit
    )

    debug(`lastStoredRedeliveryTime: ${lastStoredRedeliveryTime}`)

    const lastWebhookRedeliveryTime =
      Number(lastStoredRedeliveryTime) || Date.now() - 24 * 60 * 60 * 1000

    for (const webhook of webhooks) {
      const deliveries: Delivery[] = await fetchWebhookDeliveriesSince(
        lastWebhookRedeliveryTime,
        owner,
        repo,
        webhook.id,
        octokit
      )

      const deliveriesByGuid: { [key: string]: Delivery[] } = {}

      for (const delivery of deliveries) {
        deliveriesByGuid[delivery.guid]
          ? deliveriesByGuid[delivery.guid].push(delivery)
          : (deliveriesByGuid[delivery.guid] = [delivery])
      }

      for (const guid in deliveriesByGuid) {
        const deliveriesForGuid: Delivery[] = deliveriesByGuid[guid]
        if (
          deliveriesForGuid.some(
            (delivery: Delivery) => delivery.status === 'OK'
          )
        ) {
          break
        }

        info(
          `Redelivering webhook delivery ${deliveriesForGuid[0]?.id} for webhook ${webhook.id}`
        )
        await octokit.rest.repos.redeliverWebhookDelivery({
          owner,
          repo,
          hook_id: webhook.id,
          delivery_id: deliveriesForGuid[0]?.id
        })
      }
    }

    await updateVariable(
      lastRedeliveryVariable,
      Date.now().toString(),
      Boolean(lastStoredRedeliveryTime),
      owner,
      repo,
      octokit
    )
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) setFailed(error.message)
  }
}

async function fetchWebhookDeliveriesSince(
  lastWebhookRedeliveryTime: number,
  repoOwner: string,
  repoName: string,
  hookId: number,
  octokit: Octokit
): Promise<Delivery[]> {
  const iterator = octokit.paginate.iterator(
    octokit.rest.repos.listWebhookDeliveries,
    {
      owner: repoOwner,
      repo: repoName,
      hook_id: hookId,
      per_page: 100,
      headers: {
        'x-github-api-version': '2022-11-28'
      }
    }
  )

  const deliveries = []
  for await (const { data } of iterator) {
    const oldestDeliveryTimestamp = new Date(
      data[data.length - 1].delivered_at
    ).getTime()
    if (oldestDeliveryTimestamp < lastWebhookRedeliveryTime) {
      for (const delivery of data) {
        if (
          new Date(delivery.delivered_at).getTime() > lastWebhookRedeliveryTime
        ) {
          deliveries.push(delivery)
        } else {
          break
        }
      }
      break
    } else {
      deliveries.push(...data)
    }
  }
  return deliveries
}

async function getVariable(
  lastRedeliveryVariable: string,
  repoOwner: string,
  repoName: string,
  octokit: Octokit
): Promise<string | undefined> {
  try {
    const response = await octokit.rest.actions.getRepoVariable({
      owner: repoOwner,
      repo: repoName,
      name: lastRedeliveryVariable
    })

    const value = response.data.value
    return value
  } catch (error) {
    if ((error as { status: number }).status === 404) {
      return undefined;
    }
    throw error;
  }
}

async function updateVariable(
  variableName: string,
  value: string,
  variableExists: boolean,
  repoOwner: string,
  repoName: string,
  octokit: Octokit
): Promise<void> {
  if (variableExists) {
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/actions/variables/{name}',
      {
        owner: repoOwner,
        repo: repoName,
        name: variableName,
        value
      }
    )
  } else {
    await octokit.request('POST /repos/{owner}/{repo}/actions/variables', {
      owner: repoOwner,
      repo: repoName,
      name: variableName,
      value
    })
  }
}
