# Agent Rules for Command Brain

<RULE[project_deploy]>
- **Auto-Deployment:** Whenever a coding task, feature addition, or bug fix is completed for this project, automatically execute the deployment script (`python deploy_remote.py`) and if the backend changed, restart the services (`python restart_services.py`). Do this immediately without waiting for explicit user permission to deploy.
</RULE[project_deploy]>

<RULE[project_constants]>
- **Default Contact Information:** Dennis's default email address for this system app is `sottodennis@gmail.com`. Use this automatically whenever an email address is required for Dennis (e.g., sending document expiration reminders or system notifications).
</RULE[project_constants]>
