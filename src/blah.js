const entities = require('@jetbrains/youtrack-scripting-api/entities');

exports.rule = entities.Issue.onChange({
  title: 'Blah blah',
  guard: (ctx) => {
    console.log('blah start');
    console.log(ctx.currentUser.extensionProperties.googleRefreshToken);
    console.log(ctx.currentUser.extensionProperties.googleAccessToken);
    // const issue = ctx.issue;
    // const s = ctx.settings.projectCalendarMappings;
    // console.log(s);
    // console.log(ctx.globalStorage.extensionProperties.blahProp);
    // ctx.globalStorage.extensionProperties.blahProp = 'blah string';
    // console.log(ctx.globalStorage.extensionProperties.blahProp);

    // console.log(ctx.globalStorage.extensionProperties.intProp);
    // ctx.globalStorage.extensionProperties.blahProp++;
    // console.log(ctx.globalStorage.extensionProperties.intProp);

    console.log('blah end');
    return false;
  },
  action: async (ctx) => {
    return true;
  },
  requirements: {
    'Start datetime': {
      type: entities.Field.dateTimeType,
      name: 'Start datetime'
    }
  }
});
