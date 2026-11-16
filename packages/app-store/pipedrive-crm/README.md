## Pipedrive Integration

#### Creating a Pipedrive OAuth app

- Sign in to Pipedrive and open Settings > (company name) Developer Hub, or go to the [Pipedrive Developers Corner](https://developers.pipedrive.com/)
- Create a private app, following the steps mentioned [here](https://pipedrive.readme.io/docs/marketplace-creating-a-proper-app#create-an-app-in-5-simple-steps)
- Set `<NEXT_PUBLIC_WEBAPP_URL>/api/integrations/pipedrive-crm/callback` as the callback URL of your app
- In the "OAuth & access scopes" tab, enable full access to **Deals**, **Activities** and **Contacts**
- Copy your `client_id` and `client_secret`

#### Configuring Cal.diy

- Go to `Settings > Admin > Apps > CRM > Pipedrive CRM`, click `Edit` and enter the `client_id` and `client_secret`
- Install the app from the App Store, then enable it on the event types that should sync to Pipedrive

Each booking creates a "meeting" activity in Pipedrive, linked to the attendee. Attendees are matched to existing persons by email and only created when no person with that email exists.
