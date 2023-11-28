# Retrigger Webhook Action

![Check Dist/](https://github.com/gateixeira/retrigger-webhook-action/workflows/Check%20Dist%2F/badge.svg)
![CodeQL](https://github.com/gateixeira/retrigger-webhook-action/workflows/CodeQL/badge.svg)

---

This GitHub Action retriggers webhooks in a given repository.

It abstracts the process described in the GitHub documentation [here](https://docs.github.com/en/webhooks/using-webhooks/automatically-redelivering-failed-deliveries-for-a-repository-webhook)

It will look for the provided variable in the repository to fetch when the redelivery was previously run and will retrigger the webhooks once per `guid` to not retrigger both the original and any new redelivery attempt.

---

## Inputs

| NAME                            | DESCRIPTION                                                                                    | TYPE     | REQUIRED | DEFAULT |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | -------- | ------- |
| `token`                         | GitHub access token (Scope: classic = `repo`)                                                  | `string` | `true`   | `N/A`   |
| `repo`                          | Name of the repository where the webhook is configured.                                        | `string` | `true`   | `N/A`   |
| `owner`                         | Owner of the repository where the webhook is configured.                                       | `string` | `true`   | `N/A`   |
| `last_redelivery_variable_name` | The name of the variable that will store the last redelivery timestamp.                        | `string` | `true`   | `N/A`   |
| `webhook_id`                    | The ID to filter for a specific webhook.                                                       | `string` | `false`  | `N/A`   |

Keep in mind that `GITHUB_TOKEN` does not have sufficient permissions to redeliver webhooks. For fine-grained personal access tokens, grant the token:
- Access to the repository where the webhook was created
- Write access to the repository webhooks permission
- Write access to the repository variables permission

---

## Usage example

Add the following snippet to an existing workflow file

```yml

      - name: Run redelivery
        env:
          token: ${{ secrets.PAT_TOKEN }}
          owner: ${{ github.event.repository.name }}
          repo: ${{ github.repository_owner }}
          # webhook_id: 'YOUR_HOOK_ID'
          last_redelivery_variable_name: 'LAST_REDELIVERY'
        uses: ./
```
