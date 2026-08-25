# Printing Legion Bot
Printing Legion is a slack channel on the Hack Club slack where people w/ printers for people w/o printers. As a slack channel it is not organized, making it difficult for printers to know whether or not a print is important without reading it. As a result, there is a crisis of printers turning on pings for all messages in the channel. This bot aims to solve that by pinginging the printer only when it makes sense.

## Instructions
### Joining
Run `/add-me-as-printer <region>` in either `#printing-legion` or `#printing-legion-test-for-bot`

### Adding a custom filter
Run `/add-custom-filter <your filter>` in those same channels. `<your filter>` can be something like: `only prints that are less than 200x100x20mm and which are macropads`.

This is useful for limiting to cheap-to-ship items as many low cost carriers have very small size limits.

### Updating filament stock
`/update-filament-stock <arbitrary string that will be displayed on ping>`

This is a command that allows you to customize a string that goes after your username when you're pinged for a request. This is usually a list of filaments that you have.

## Testing
When testing, use a real github URL, or else, something bad will happen. The link is used to fetch the STL and STEP files to get their bounding boxes, but if the link is wrong, it assumes that the request was malformed.

Make sure to include all necessary information such as project name, github link, area (city/state/province AND country), filament type and colour, and ysws.