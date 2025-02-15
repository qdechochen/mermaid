import moment from 'moment-mini';
import { sanitizeUrl } from '@braintree/sanitize-url';
import { log } from '../../logger';
import * as configApi from '../../config';
import utils from '../../utils';
import mermaidAPI from '../../mermaidAPI';

let dateFormat = '';
let axisFormat = '';
let axisLocale = 'en-US';
let todayMarker = '';
let includes = [];
let excludes = [];
let title = '';
let sections = [];
let tasks = [];
let currentSection = '';
const tags = ['active', 'done', 'crit', 'milestone'];
let funs = [];
let inclusiveEndDates = false;
let topAxis = false;

// The serial order of the task in the script
let lastOrder = 0;

export const parseDirective = function (statement, context, type) {
  mermaidAPI.parseDirective(this, statement, context, type);
};

export const clear = function () {
  sections = [];
  tasks = [];
  currentSection = '';
  funs = [];
  title = '';
  taskCnt = 0;
  lastTask = undefined;
  lastTaskID = undefined;
  rawTasks = [];
  dateFormat = '';
  axisFormat = '';
  axisLocale = 'en-US';
  todayMarker = '';
  includes = [];
  excludes = [];
  inclusiveEndDates = false;
  topAxis = false;
  lastOrder = 0;
};

export const setAxisFormat = function (txt) {
  axisFormat = txt;
};

export const getAxisFormat = function () {
  return axisFormat;
};
export const setAxisLocale = function (txt) {
  axisLocale = txt;
};

export const getAxisLocale = function () {
  return axisLocale;
};

export const setTodayMarker = function (txt) {
  todayMarker = txt;
};

export const getTodayMarker = function () {
  return todayMarker;
};

export const setDateFormat = function (txt) {
  dateFormat = txt;
};

export const enableInclusiveEndDates = function () {
  inclusiveEndDates = true;
};

export const endDatesAreInclusive = function () {
  return inclusiveEndDates;
};

export const enableTopAxis = function () {
  topAxis = true;
};

export const topAxisEnabled = function () {
  return topAxis;
};

export const getDateFormat = function () {
  return dateFormat;
};

export const setIncludes = function (txt) {
  includes = txt.toLowerCase().split(/[\s,]+/);
};

export const getIncludes = function () {
  return includes;
};
export const setExcludes = function (txt) {
  excludes = txt.toLowerCase().split(/[\s,]+/);
};

export const getExcludes = function () {
  return excludes;
};

export const setTitle = function (txt) {
  title = txt;
};

export const getTitle = function () {
  return title;
};

export const addSection = function (txt) {
  currentSection = txt;
  sections.push(txt);
};

export const getSections = function () {
  return sections;
};

export const getTasks = function () {
  let allItemsPricessed = compileTasks();
  const maxDepth = 10;
  let iterationCount = 0;
  while (!allItemsPricessed && iterationCount < maxDepth) {
    allItemsPricessed = compileTasks();
    iterationCount++;
  }

  tasks = rawTasks;

  return tasks;
};

export const isInvalidDate = function (date, dateFormat, excludes, includes) {
  if (includes.indexOf(date.format(dateFormat.trim())) >= 0) {
    return false;
  }
  if (date.isoWeekday() >= 6 && excludes.indexOf('weekends') >= 0) {
    return true;
  }
  if (excludes.indexOf(date.format('dddd').toLowerCase()) >= 0) {
    return true;
  }
  return excludes.indexOf(date.format(dateFormat.trim())) >= 0;
};

const checkTaskDates = function (task, dateFormat, excludes, includes) {
  if (!excludes.length || task.manualEndTime) return;
  let startTime = moment(task.startTime, dateFormat, true);
  startTime.add(1, 'd');
  let endTime = moment(task.endTime, dateFormat, true);
  let renderEndTime = fixTaskDates(startTime, endTime, dateFormat, excludes, includes);
  task.endTime = endTime.toDate();
  task.renderEndTime = renderEndTime;

  task.totalDays = getTaskTotalDays(
    moment(task.startTime, dateFormat, true),
    moment(task.endTime, dateFormat, true),
    dateFormat,
    excludes,
    includes
  );
};

const getTaskTotalDays = function (startTime, endTime, dateFormat, excludes, includes) {
  let invalid = false;
  let total = 0;
  while (startTime < endTime) {
    total++;
    invalid = isInvalidDate(startTime, dateFormat, excludes, includes);
    if (invalid) {
      total--;
    }
    startTime.add(1, 'd');
  }
  return total;
};

const fixTaskDates = function (startTime, endTime, dateFormat, excludes, includes) {
  let invalid = false;
  let renderEndTime = null;
  while (startTime <= endTime) {
    if (!invalid) {
      renderEndTime = endTime.toDate();
    }
    invalid = isInvalidDate(startTime, dateFormat, excludes, includes);
    if (invalid) {
      endTime.add(1, 'd');
    }
    startTime.add(1, 'd');
  }
  return renderEndTime;
};

const getStartDate = function (prevTime, dateFormat, str) {
  str = str.trim();

  // Test for after
  const re = /^after\s+([\d\w- ]+)/;
  const afterStatement = re.exec(str.trim());

  if (afterStatement !== null) {
    // check all after ids and take the latest
    let latestEndingTask = null;
    afterStatement[1].split(' ').forEach(function (id) {
      let task = findTaskById(id);
      if (typeof task !== 'undefined') {
        if (!latestEndingTask) {
          latestEndingTask = task;
        } else {
          if (task.endTime > latestEndingTask.endTime) {
            latestEndingTask = task;
          }
        }
      }
    });

    if (!latestEndingTask) {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      return dt;
    } else {
      return latestEndingTask.endTime;
    }
  }

  // Check for actual date set
  let mDate = moment(str, dateFormat.trim(), true);
  if (mDate.isValid()) {
    return mDate.toDate();
  } else {
    log.debug('Invalid date:' + str);
    log.debug('With date format:' + dateFormat.trim());
  }

  // Default date - now
  return new Date();
};

const durationToDate = function (durationStatement, relativeTime) {
  if (durationStatement !== null) {
    switch (durationStatement[2]) {
      case 's':
        relativeTime.add(durationStatement[1], 'seconds');
        break;
      case 'm':
        relativeTime.add(durationStatement[1], 'minutes');
        break;
      case 'h':
        relativeTime.add(durationStatement[1], 'hours');
        break;
      case 'd':
        relativeTime.add(durationStatement[1], 'days');
        break;
      case 'w':
        relativeTime.add(durationStatement[1], 'weeks');
        break;
    }
  }
  // Default date - now
  return relativeTime.toDate();
};

const getEndDate = function (prevTime, dateFormat, str, inclusive) {
  inclusive = inclusive || false;
  str = str.trim();

  // Check for actual date
  let mDate = moment(str, dateFormat.trim(), true);
  if (mDate.isValid()) {
    if (inclusive) {
      mDate.add(1, 'd');
    }
    return mDate.toDate();
  }

  return durationToDate(/^([\d]+)([wdhms])/.exec(str.trim()), moment(prevTime));
};

let taskCnt = 0;
const parseId = function (idStr) {
  if (typeof idStr === 'undefined') {
    taskCnt = taskCnt + 1;
    return 'task' + taskCnt;
  }
  return idStr;
};
// id, startDate, endDate
// id, startDate, length
// id, after x, endDate
// id, after x, length
// startDate, endDate
// startDate, length
// after x, endDate
// after x, length
// endDate
// length

const compileData = function (prevTask, dataStr) {
  let ds;

  if (dataStr.substr(0, 1) === ':') {
    ds = dataStr.substr(1, dataStr.length);
  } else {
    ds = dataStr;
  }

  const data = ds.split(',');

  const task = {};

  // Get tags like active, done, crit and milestone
  getTaskTags(data, task, tags);

  for (let i = 0; i < data.length; i++) {
    data[i] = data[i].trim();
  }

  let endTimeData = '';
  switch (data.length) {
    case 1:
      task.id = parseId();
      task.startTime = prevTask.endTime;
      endTimeData = data[0];
      break;
    case 2:
      task.id = parseId();
      task.startTime = getStartDate(undefined, dateFormat, data[0]);
      endTimeData = data[1];
      break;
    case 3:
      task.id = parseId(data[0]);
      task.startTime = getStartDate(undefined, dateFormat, data[1]);
      endTimeData = data[2];
      break;
    default:
  }

  if (endTimeData) {
    task.endTime = getEndDate(task.startTime, dateFormat, endTimeData, inclusiveEndDates);
    task.manualEndTime = moment(endTimeData, 'YYYY-MM-DD', true).isValid();
    checkTaskDates(task, dateFormat, excludes, includes);
  }

  return task;
};

const parseData = function (prevTaskId, dataStr) {
  let ds;
  if (dataStr.substr(0, 1) === ':') {
    ds = dataStr.substr(1, dataStr.length);
  } else {
    ds = dataStr;
  }

  const data = ds.split(',').map(t => t.trim());

  const task = {};

  // Get tags like active, done, crit and milestone
  getTaskTags(data, task, tags);
  getTaskResources(data, task);
  getTaskPercent(data, task);

  for (let i = 0; i < data.length; i++) {
    data[i] = data[i].trim();
  }

  switch (data.length) {
    case 1:
      task.id = parseId();
      task.startTime = {
        type: 'prevTaskEnd',
        id: prevTaskId,
      };
      task.endTime = {
        data: data[0],
      };
      break;
    case 2:
      task.id = parseId();
      task.startTime = {
        type: 'getStartDate',
        startData: data[0],
      };
      task.endTime = {
        data: data[1],
      };
      break;
    case 3:
      task.id = parseId(data[0]);
      task.startTime = {
        type: 'getStartDate',
        startData: data[1],
      };
      task.endTime = {
        data: data[2],
      };
      break;
    default:
  }

  return task;
};

let lastTask;
let lastTaskID;
let rawTasks = [];
const taskDb = {};
export const addTask = function (descr, data) {
  const rawTask = {
    section: currentSection,
    type: currentSection,
    processed: false,
    manualEndTime: false,
    renderEndTime: null,
    raw: { data: data },
    task: descr,
    classes: [],
  };

  const taskInfo = parseData(lastTaskID, data);
  rawTask.raw.startTime = taskInfo.startTime;
  rawTask.raw.endTime = taskInfo.endTime;
  rawTask.id = taskInfo.id;
  rawTask.prevTaskId = lastTaskID;
  rawTask.active = taskInfo.active;
  rawTask.done = taskInfo.done;
  rawTask.crit = taskInfo.crit;
  rawTask.milestone = taskInfo.milestone;
  rawTask.percent = taskInfo.percent;
  rawTask.resources = taskInfo.resources;
  rawTask.order = lastOrder;

  lastOrder++;

  const pos = rawTasks.push(rawTask);

  lastTaskID = rawTask.id;
  // Store cross ref
  taskDb[rawTask.id] = pos - 1;
};

export const findTaskById = function (id) {
  const pos = taskDb[id];
  return rawTasks[pos];
};

export const addTaskOrg = function (descr, data) {
  const newTask = {
    section: currentSection,
    type: currentSection,
    description: descr,
    task: descr,
    classes: [],
  };
  const taskInfo = compileData(lastTask, data);
  newTask.startTime = taskInfo.startTime;
  newTask.endTime = taskInfo.endTime;
  newTask.id = taskInfo.id;
  newTask.active = taskInfo.active;
  newTask.done = taskInfo.done;
  newTask.crit = taskInfo.crit;
  newTask.milestone = taskInfo.milestone;
  lastTask = newTask;
  tasks.push(newTask);
};

const compileTasks = function () {
  const compileTask = function (pos) {
    const task = rawTasks[pos];
    let startTime = '';
    switch (rawTasks[pos].raw.startTime.type) {
      case 'prevTaskEnd': {
        const prevTask = findTaskById(task.prevTaskId);
        task.startTime = prevTask.endTime;
        break;
      }
      case 'getStartDate':
        startTime = getStartDate(undefined, dateFormat, rawTasks[pos].raw.startTime.startData);
        if (startTime) {
          rawTasks[pos].startTime = startTime;
        }
        break;
    }

    if (rawTasks[pos].startTime) {
      rawTasks[pos].endTime = getEndDate(
        rawTasks[pos].startTime,
        dateFormat,
        rawTasks[pos].raw.endTime.data,
        inclusiveEndDates
      );
      if (rawTasks[pos].endTime) {
        rawTasks[pos].processed = true;
        rawTasks[pos].manualEndTime = moment(
          rawTasks[pos].raw.endTime.data,
          'YYYY-MM-DD',
          true
        ).isValid();
        checkTaskDates(rawTasks[pos], dateFormat, excludes, includes);
      }
    }

    return rawTasks[pos].processed;
  };

  let allProcessed = true;
  for (let i = 0; i < rawTasks.length; i++) {
    compileTask(i);

    allProcessed = allProcessed && rawTasks[i].processed;
  }
  return allProcessed;
};

/**
 * Called by parser when a link is found. Adds the URL to the vertex data.
 * @param ids Comma separated list of ids
 * @param linkStr URL to create a link for
 */
export const setLink = function (ids, _linkStr) {
  let linkStr = _linkStr;
  if (configApi.getConfig().securityLevel !== 'loose') {
    linkStr = sanitizeUrl(_linkStr);
  }
  ids.split(',').forEach(function (id) {
    let rawTask = findTaskById(id);
    if (typeof rawTask !== 'undefined') {
      pushFun(id, () => {
        window.open(linkStr, '_self');
      });
    }
  });
  setClass(ids, 'clickable');
};

/**
 * Called by parser when a special node is found, e.g. a clickable element.
 * @param ids Comma separated list of ids
 * @param className Class to add
 */
export const setClass = function (ids, className) {
  ids.split(',').forEach(function (id) {
    let rawTask = findTaskById(id);
    if (typeof rawTask !== 'undefined') {
      rawTask.classes.push(className);
    }
  });
};

const setClickFun = function (id, functionName, functionArgs) {
  if (configApi.getConfig().securityLevel !== 'loose') {
    return;
  }
  if (typeof functionName === 'undefined') {
    return;
  }

  let argList = [];
  if (typeof functionArgs === 'string') {
    /* Splits functionArgs by ',', ignoring all ',' in double quoted strings */
    argList = functionArgs.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    for (let i = 0; i < argList.length; i++) {
      let item = argList[i].trim();
      /* Removes all double quotes at the start and end of an argument */
      /* This preserves all starting and ending whitespace inside */
      if (item.charAt(0) === '"' && item.charAt(item.length - 1) === '"') {
        item = item.substr(1, item.length - 2);
      }
      argList[i] = item;
    }
  }

  /* if no arguments passed into callback, default to passing in id */
  if (argList.length === 0) {
    argList.push(id);
  }

  let rawTask = findTaskById(id);
  if (typeof rawTask !== 'undefined') {
    pushFun(id, () => {
      utils.runFunc(functionName, ...argList);
    });
  }
};

/**
 * The callbackFunction is executed in a click event bound to the task with the specified id or the task's assigned text
 * @param id The task's id
 * @param callbackFunction A function to be executed when clicked on the task or the task's text
 */
const pushFun = function (id, callbackFunction) {
  funs.push(function () {
    // const elem = d3.select(element).select(`[id="${id}"]`)
    const elem = document.querySelector(`[id="${id}"]`);
    if (elem !== null) {
      elem.addEventListener('click', function () {
        callbackFunction();
      });
    }
  });
  funs.push(function () {
    // const elem = d3.select(element).select(`[id="${id}-text"]`)
    const elem = document.querySelector(`[id="${id}-text"]`);
    if (elem !== null) {
      elem.addEventListener('click', function () {
        callbackFunction();
      });
    }
  });
};

/**
 * Called by parser when a click definition is found. Registers an event handler.
 * @param ids Comma separated list of ids
 * @param functionName Function to be called on click
 * @param functionArgs Function args the function should be called with
 */
export const setClickEvent = function (ids, functionName, functionArgs) {
  ids.split(',').forEach(function (id) {
    setClickFun(id, functionName, functionArgs);
  });
  setClass(ids, 'clickable');
};

/**
 * Binds all functions previously added to fun (specified through click) to the element
 * @param element
 */
export const bindFunctions = function (element) {
  funs.forEach(function (fun) {
    fun(element);
  });
};

export default {
  parseDirective,
  getConfig: () => configApi.getConfig().gantt,
  clear,
  setDateFormat,
  getDateFormat,
  enableInclusiveEndDates,
  endDatesAreInclusive,
  enableTopAxis,
  topAxisEnabled,
  setAxisFormat,
  getAxisFormat,
  setAxisLocale,
  getAxisLocale,
  setTodayMarker,
  getTodayMarker,
  setTitle,
  getTitle,
  addSection,
  getSections,
  getTasks,
  addTask,
  findTaskById,
  addTaskOrg,
  setIncludes,
  getIncludes,
  setExcludes,
  getExcludes,
  setClickEvent,
  setLink,
  bindFunctions,
  durationToDate,
  isInvalidDate,
};

function getTaskTags(data, task, tags) {
  let matchFound = true;
  while (matchFound) {
    matchFound = false;
    tags.forEach(function (t) {
      const pattern = '^\\s*' + t + '\\s*$';
      const regex = new RegExp(pattern);
      if (data[0].match(regex)) {
        task[t] = true;
        data.shift(1);
        matchFound = true;
      }
    });
  }
}
function getTaskResources(data, task) {
  const resources = [];
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].startsWith('@')) {
      resources.unshift(data[i].substr(1));
      data.splice(i, 1);
    }
  }
  if (resources.length > 0) {
    task.resources = resources;
  }
}
function getTaskPercent(data, task) {
  task.percent = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].endsWith('%')) {
      const number = data[i].substr(0, data[i].length - 1);
      data.splice(i, 1);
      if (!isNaN(number) && !task.percent) {
        task.percent = Number(number);
      }
    }
  }
}
