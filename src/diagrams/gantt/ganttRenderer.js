import moment from 'moment-mini';
import {
  select,
  scaleTime,
  min,
  max,
  scaleLinear,
  interpolateHcl,
  axisBottom,
  axisTop,
  timeFormat,
  timeFormatDefaultLocale,
} from 'd3';

import { parser } from './parser/gantt';
import common from '../common/common';
import ganttDb from './ganttDb';
import getLocale from './locale';
import { getConfig } from '../../config';
import { configureSvgSize } from '../../utils';

parser.yy = ganttDb;
export const setConf = function () {
  // const keys = Object.keys(cnf);
  // keys.forEach(function(key) {
  //   conf[key] = cnf[key];
  // });
};
let w;
export const draw = function (text, id) {
  const conf = getConfig().gantt;
  parser.yy.clear();
  parser.parse(text);

  timeFormatDefaultLocale(getLocale(parser.yy.getAxisLocale()));
  const formatTime = timeFormat(parser.yy.getAxisFormat() || conf.axisFormat || '%Y-%m-%d');

  const elem = document.getElementById(id);
  w = elem.parentElement.offsetWidth;

  if (typeof w === 'undefined') {
    w = 1200;
  }

  if (typeof conf.useWidth !== 'undefined') {
    w = conf.useWidth;
  }

  const taskArray = parser.yy.getTasks();

  // Set height based on number of tasks
  const h = taskArray.length * (conf.barHeight + conf.barGap) + 2 * conf.topPadding;

  // Set viewBox
  elem.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  const svg = select(`[id="${id}"]`);

  let rangeIndicatorGroup = null;

  // Set timescale
  const timeScale = scaleTime()
    .domain([
      min(taskArray, function (d) {
        return d.startTime;
      }),
      max(taskArray, function (d) {
        return d.endTime;
      }),
    ])
    .rangeRound([0, w - conf.leftPadding - conf.rightPadding]);

  let categories = [];

  for (let i = 0; i < taskArray.length; i++) {
    categories.push(taskArray[i].type);
  }

  const catsUnfiltered = categories; // for vert labels

  categories = checkUnique(categories);

  function taskCompare(a, b) {
    const taskA = a.startTime;
    const taskB = b.startTime;
    let result = 0;
    if (taskA > taskB) {
      result = 1;
    } else if (taskA < taskB) {
      result = -1;
    }
    return result;
  }

  const themeVars = getConfig().themeVariables;
  console.log(themeVars);
  let tooltipElem = select('.mermaidGanttTooltip');
  if ((tooltipElem._groups || tooltipElem)[0][0] === null) {
    tooltipElem = select('body')
      .append('div')
      .attr('class', 'mermaidGanttTooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('max-width', '200px')
      .style('font-family', themeVars.fontFamily)
      .style('font-size', '12px')
      .style('background', themeVars.tertiaryColor)
      .style('border', '1px solid ' + themeVars.border2)
      .style('border-radius', '2px')
      .style('pointer-events', 'none')
      .style('z-index', 100)
      .style('transform', 'translate(-50%, 16px)')
      .style('padding', '6px 15px');
  }

  // Sort the task array using the above taskCompare() so that
  // tasks are created based on their order of startTime
  taskArray.sort(taskCompare);

  makeGant(taskArray, w, h);

  configureSvgSize(svg, h, w, conf.useMaxWidth);

  svg
    .append('text')
    .text(parser.yy.getTitle())
    .attr('x', w / 2)
    .attr('y', conf.titleTopMargin)
    .attr('class', 'titleText');

  function makeGant(tasks, pageWidth, pageHeight) {
    const barHeight = conf.barHeight;
    const gap = barHeight + conf.barGap;
    const topPadding = conf.topPadding;
    const leftPadding = conf.leftPadding;

    const colorScale = scaleLinear()
      .domain([0, categories.length])
      .range(['#00B9FA', '#F95002'])
      .interpolate(interpolateHcl);

    drawExcludeDays(
      gap,
      topPadding,
      leftPadding,
      pageWidth,
      pageHeight,
      tasks,
      parser.yy.getExcludes(),
      parser.yy.getIncludes()
    );
    makeGrid(leftPadding, topPadding, pageWidth, pageHeight);
    drawRects(tasks, gap, topPadding, leftPadding, barHeight, colorScale, pageWidth, pageHeight);
    vertLabels(gap, topPadding, leftPadding, barHeight, colorScale);
    drawToday(leftPadding, topPadding, pageWidth, pageHeight);
    drawRangeIndicatorGroup(topPadding, leftPadding, pageWidth, pageHeight);
  }

  function drawRangeIndicatorGroup(topPadding, leftPadding, pageWidth, pageHeight) {
    rangeIndicatorGroup = svg.append('g');

    rangeIndicatorGroup
      .selectAll('g')
      .data([0, 0])
      .enter()
      .append('line')
      .attr('class', 'date-range-indicator__line')
      .attr('x1', leftPadding - 1)
      .attr('y1', conf.gridLineStartPadding)
      .attr('x2', leftPadding - 1)
      .attr('y2', pageHeight - topPadding);

    rangeIndicatorGroup
      .selectAll('g')
      .data([0, 0, 0])
      .enter()
      .append('text')
      .text('')
      .style('text-anchor', 'middle')
      .attr('fill', '#000')
      .attr('stroke', 'none')
      .attr('font-size', 10)
      .attr('x', leftPadding - 2)
      .attr('y', 0);
  }

  function setRangeIndicatorPosition(startTime, endTime, totalDays, top) {
    if (!startTime) {
      rangeIndicatorGroup.attr('opacity', 0);
    } else {
      rangeIndicatorGroup
        .attr('opacity', 1)
        .selectAll('line')
        .data([startTime, endTime])
        .attr('transform', function (d, i) {
          return 'translate(' + timeScale(d) + ' 0)';
        });

      rangeIndicatorGroup
        .selectAll('text')
        .data([startTime, endTime, false])
        .text(function (d) {
          return d ? formatTime(d) : totalDays;
        })
        .attr('y', top - 2)
        .attr('transform', function (d) {
          return (
            'translate(' +
            (d ? timeScale(d) : (timeScale(startTime) + timeScale(endTime)) / 2) +
            ' 0)'
          );
        });
    }
  }

  function drawRects(theArray, theGap, theTopPad, theSidePad, theBarHeight, theColorScale, w) {
    // Draw background rects covering the entire width of the graph, these form the section rows.
    svg
      .append('g')
      .selectAll('rect')
      .data(theArray)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;
        return i * theGap + theTopPad - 2;
      })
      .attr('width', function () {
        return w - conf.rightPadding / 2;
      })
      .attr('height', theGap)
      .attr('class', function (d) {
        for (let i = 0; i < categories.length; i++) {
          if (d.type === categories[i]) {
            return 'section section' + (i % conf.numberSectionStyles);
          }
        }
        return 'section section0';
      });

    // Draw the rects representing the tasks
    const rectangleGroups = svg.append('g').selectAll('g').data(theArray).enter();

    rectangleGroups
      .append('rect')
      .attr('id', function (d) {
        return d.id;
      })
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('x', function (d) {
        if (d.milestone) {
          return (
            timeScale(d.startTime) +
            theSidePad +
            0.5 * (timeScale(d.endTime) - timeScale(d.startTime)) -
            0.5 * theBarHeight
          );
        }
        return timeScale(d.startTime) + theSidePad;
      })
      .attr('y', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;
        return i * theGap + theTopPad;
      })
      .attr('width', function (d) {
        if (d.milestone) {
          return theBarHeight;
        }
        return timeScale(d.renderEndTime || d.endTime) - timeScale(d.startTime);
      })
      .attr('height', theBarHeight)
      .attr('transform-origin', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;

        return (
          (
            timeScale(d.startTime) +
            theSidePad +
            0.5 * (timeScale(d.endTime) - timeScale(d.startTime))
          ).toString() +
          'px ' +
          (i * theGap + theTopPad + 0.5 * theBarHeight).toString() +
          'px'
        );
      })
      .attr('class', function (d) {
        const res = 'task';

        let classStr = '';
        if (d.classes.length > 0) {
          classStr = d.classes.join(' ');
        }

        let secNum = 0;
        for (let i = 0; i < categories.length; i++) {
          if (d.type === categories[i]) {
            secNum = i % conf.numberSectionStyles;
          }
        }

        let taskClass = '';
        if (d.active) {
          if (d.crit) {
            taskClass += ' activeCrit';
          } else {
            taskClass = ' active';
          }
        } else if (d.done) {
          if (d.crit) {
            taskClass = ' doneCrit';
          } else {
            taskClass = ' done';
          }
        } else {
          if (d.crit) {
            taskClass += ' crit';
          }
        }

        if (taskClass.length === 0) {
          taskClass = ' task';
        }

        if (d.milestone) {
          taskClass = ' milestone ' + taskClass;
        }

        taskClass += secNum;

        taskClass += ' ' + classStr;

        return res + taskClass;
      })
      .on('mouseover', function (e, d) {
        let content = `<div style="font-weight: bold">${d.task} ${
          d.percent ? '(' + d.percent + '%)' : ''
        }</div>`;
        if (d.resources) {
          content += `<div style="padding-top: 5px;">${d.resources
            .map((t) => '@' + t)
            .join(', ')}</div>`;
        }
        tooltipElem.html(content).transition().duration(200).style('opacity', '.9');
      })
      .on('mousemove', function (e, d) {
        setRangeIndicatorPosition(
          d.startTime,
          d.renderEndTime || d.endTime,
          d.totalDays,
          d.order * theGap + theTopPad
        );
        tooltipElem.style('left', e.clientX + 'px').style('top', e.clientY + 'px');
      })
      .on('mouseout', function () {
        tooltipElem.transition().duration(200).style('opacity', 0);
        setRangeIndicatorPosition();
      });

    rectangleGroups
      .append('rect')
      .attr('id', function (d) {
        return d.id;
      })
      .attr('x', function (d) {
        if (d.milestone) {
          return (
            timeScale(d.startTime) +
            theSidePad +
            0.5 * (timeScale(d.endTime) - timeScale(d.startTime)) -
            0.5 * theBarHeight
          );
        }
        return timeScale(d.startTime) + theSidePad;
      })
      .attr('y', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;
        return i * theGap + theTopPad;
      })
      .attr('width', function (d) {
        if (d.milestone) {
          return theBarHeight;
        }
        return (
          (timeScale(d.renderEndTime || d.endTime) - timeScale(d.startTime)) * (d.percent / 100)
        );
      })
      .attr('height', theBarHeight)
      .attr('transform-origin', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;

        return (
          (
            timeScale(d.startTime) +
            theSidePad +
            0.5 * (timeScale(d.endTime) - timeScale(d.startTime))
          ).toString() +
          'px ' +
          (i * theGap + theTopPad + 0.5 * theBarHeight).toString() +
          'px'
        );
      })
      .attr('class', function (d) {
        const res = 'task percent';

        let classStr = '';
        if (d.classes.length > 0) {
          classStr = d.classes.join(' ');
        }

        let secNum = 0;
        for (let i = 0; i < categories.length; i++) {
          if (d.type === categories[i]) {
            secNum = i % conf.numberSectionStyles;
          }
        }

        let taskClass = '';
        if (d.active) {
          if (d.crit) {
            taskClass += ' activeCrit';
          } else {
            taskClass = ' active';
          }
        } else if (d.done) {
          if (d.crit) {
            taskClass = ' doneCrit';
          } else {
            taskClass = ' done';
          }
        } else {
          if (d.crit) {
            taskClass += ' crit';
          }
        }

        if (taskClass.length === 0) {
          taskClass = ' task';
        }

        if (d.milestone) {
          taskClass = ' milestone ' + taskClass;
        }

        taskClass += secNum;

        taskClass += ' ' + classStr;

        return res + taskClass;
      });

    // Append task labels
    rectangleGroups
      .append('text')
      .attr('id', function (d) {
        return d.id + '-text';
      })
      .text(function (d) {
        return d.task;
      })
      .attr('font-size', conf.fontSize)
      .attr('x', function (d) {
        let startX = timeScale(d.startTime);
        let endX = timeScale(d.renderEndTime || d.endTime);
        if (d.milestone) {
          startX += 0.5 * (timeScale(d.endTime) - timeScale(d.startTime)) - 0.5 * theBarHeight;
        }
        if (d.milestone) {
          endX = startX + theBarHeight;
        }
        const textWidth = this.getBBox().width;

        // Check id text width > width of rectangle
        if (textWidth > endX - startX) {
          if (endX + textWidth + 1.5 * conf.leftPadding > w) {
            return startX + theSidePad - 5;
          } else {
            return endX + theSidePad + 5;
          }
        } else {
          return (endX - startX) / 2 + startX + theSidePad;
        }
      })
      .attr('y', function (d, i) {
        // Ignore the incoming i value and use our order instead
        i = d.order;
        return i * theGap + conf.barHeight / 2 + (conf.fontSize / 2 - 2) + theTopPad;
      })
      .attr('text-height', theBarHeight)
      .attr('class', function (d) {
        const startX = timeScale(d.startTime);
        let endX = timeScale(d.endTime);
        if (d.milestone) {
          endX = startX + theBarHeight;
        }
        const textWidth = this.getBBox().width;

        let classStr = '';
        if (d.classes.length > 0) {
          classStr = d.classes.join(' ');
        }

        let secNum = 0;
        for (let i = 0; i < categories.length; i++) {
          if (d.type === categories[i]) {
            secNum = i % conf.numberSectionStyles;
          }
        }

        let taskType = '';
        if (d.active) {
          if (d.crit) {
            taskType = 'activeCritText' + secNum;
          } else {
            taskType = 'activeText' + secNum;
          }
        }

        if (d.done) {
          if (d.crit) {
            taskType = taskType + ' doneCritText' + secNum;
          } else {
            taskType = taskType + ' doneText' + secNum;
          }
        } else {
          if (d.crit) {
            taskType = taskType + ' critText' + secNum;
          }
        }

        if (d.milestone) {
          taskType += ' milestoneText';
        }

        // Check id text width > width of rectangle
        if (textWidth > endX - startX) {
          if (endX + textWidth + 1.5 * conf.leftPadding > w) {
            return classStr + ' taskTextOutsideLeft taskTextOutside' + secNum + ' ' + taskType;
          } else {
            return (
              classStr +
              ' taskTextOutsideRight taskTextOutside' +
              secNum +
              ' ' +
              taskType +
              ' width-' +
              textWidth
            );
          }
        } else {
          return classStr + ' taskText taskText' + secNum + ' ' + taskType + ' width-' + textWidth;
        }
      });
  }
  function drawExcludeDays(theGap, theTopPad, theSidePad, w, h, tasks, excludes, includes) {
    const minTime = tasks.reduce(
      (min, { startTime }) => (min ? Math.min(min, startTime) : startTime),
      0
    );
    const maxTime = tasks.reduce((max, { endTime }) => (max ? Math.max(max, endTime) : endTime), 0);
    const dateFormat = parser.yy.getDateFormat();
    if (!minTime || !maxTime) return;

    const excludeRanges = [];
    let range = null;
    let d = moment(minTime);
    while (d.valueOf() <= maxTime) {
      if (parser.yy.isInvalidDate(d, dateFormat, excludes, includes)) {
        if (!range) {
          range = {
            start: d.clone(),
            end: d.clone(),
          };
        } else {
          range.end = d.clone();
        }
      } else {
        if (range) {
          excludeRanges.push(range);
          range = null;
        }
      }
      d.add(1, 'd');
    }

    const rectangles = svg.append('g').selectAll('rect').data(excludeRanges).enter();

    rectangles
      .append('rect')
      .attr('id', function (d) {
        return 'exclude-' + d.start.format('YYYY-MM-DD');
      })
      .attr('x', function (d) {
        return timeScale(d.start) + theSidePad;
      })
      .attr('y', conf.gridLineStartPadding)
      .attr('width', function (d) {
        const renderEnd = d.end.clone().add(1, 'day');
        return timeScale(renderEnd) - timeScale(d.start);
      })
      .attr('height', h - theTopPad - conf.gridLineStartPadding)
      .attr('transform-origin', function (d, i) {
        return (
          (
            timeScale(d.start) +
            theSidePad +
            0.5 * (timeScale(d.end) - timeScale(d.start))
          ).toString() +
          'px ' +
          (i * theGap + 0.5 * h).toString() +
          'px'
        );
      })
      .attr('class', 'exclude-range');
  }

  function makeGrid(theSidePad, theTopPad, w, h) {
    let bottomXAxis = axisBottom(timeScale)
      .tickSize(-h + theTopPad + conf.gridLineStartPadding)
      .tickFormat(formatTime);

    svg
      .append('g')
      .attr('class', 'grid')
      .attr('transform', 'translate(' + theSidePad + ', ' + (h - 50) + ')')
      .call(bottomXAxis)
      .selectAll('text')
      .style('text-anchor', 'middle')
      .attr('fill', '#000')
      .attr('stroke', 'none')
      .attr('font-size', 10)
      .attr('dy', '1em');

    if (ganttDb.topAxisEnabled() || conf.topAxis) {
      let topXAxis = axisTop(timeScale)
        .tickSize(-h + theTopPad + conf.gridLineStartPadding)
        .tickFormat(formatTime);

      svg
        .append('g')
        .attr('class', 'grid')
        .attr('transform', 'translate(' + theSidePad + ', ' + theTopPad + ')')
        .call(topXAxis)
        .selectAll('text')
        .style('text-anchor', 'middle')
        .attr('fill', '#000')
        .attr('stroke', 'none')
        .attr('font-size', 10);
      // .attr('dy', '1em');
    }
  }

  function vertLabels(theGap, theTopPad) {
    const numOccurances = [];
    let prevGap = 0;

    for (let i = 0; i < categories.length; i++) {
      numOccurances[i] = [categories[i], getCount(categories[i], catsUnfiltered)];
    }

    svg
      .append('g') // without doing this, impossible to put grid lines behind text
      .selectAll('text')
      .data(numOccurances)
      .enter()
      .append(function (d) {
        const rows = d[0].split(common.lineBreakRegex);
        const dy = -(rows.length - 1) / 2;

        const svgLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        svgLabel.setAttribute('dy', dy + 'em');

        for (let j = 0; j < rows.length; j++) {
          const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('alignment-baseline', 'central');
          tspan.setAttribute('x', '10');
          if (j > 0) tspan.setAttribute('dy', '1em');
          tspan.textContent = rows[j];
          svgLabel.appendChild(tspan);
        }
        return svgLabel;
      })
      .attr('x', 10)
      .attr('y', function (d, i) {
        if (i > 0) {
          for (let j = 0; j < i; j++) {
            prevGap += numOccurances[i - 1][1];
            return (d[1] * theGap) / 2 + prevGap * theGap + theTopPad;
          }
        } else {
          return (d[1] * theGap) / 2 + theTopPad;
        }
      })
      .attr('font-size', conf.sectionFontSize)
      .attr('font-size', conf.sectionFontSize)
      .attr('class', function (d) {
        for (let i = 0; i < categories.length; i++) {
          if (d[0] === categories[i]) {
            return 'sectionTitle sectionTitle' + (i % conf.numberSectionStyles);
          }
        }
        return 'sectionTitle';
      });
  }

  function drawToday(theSidePad, theTopPad, w, h) {
    const todayMarker = ganttDb.getTodayMarker();
    if (todayMarker === 'off') {
      return;
    }

    const todayG = svg.append('g').attr('class', 'today');
    const today = new Date();
    const todayLine = todayG.append('line');

    todayLine
      .attr('x1', timeScale(today) + theSidePad)
      .attr('x2', timeScale(today) + theSidePad)
      .attr('y1', conf.titleTopMargin)
      .attr('y2', h - conf.titleTopMargin)
      .attr('class', 'today');

    if (todayMarker !== '') {
      todayLine.attr('style', todayMarker.replace(/,/g, ';'));
    }
  }

  // from this stackexchange question: http://stackoverflow.com/questions/1890203/unique-for-arrays-in-javascript
  function checkUnique(arr) {
    const hash = {};
    const result = [];
    for (let i = 0, l = arr.length; i < l; ++i) {
      if (!Object.prototype.hasOwnProperty.call(hash, arr[i])) {
        // eslint-disable-line
        // it works with objects! in FF, at least
        hash[arr[i]] = true;
        result.push(arr[i]);
      }
    }
    return result;
  }

  // from this stackexchange question: http://stackoverflow.com/questions/14227981/count-how-many-strings-in-an-array-have-duplicates-in-the-same-array
  function getCounts(arr) {
    let i = arr.length; // const to loop over
    const obj = {}; // obj to store results
    while (i) {
      obj[arr[--i]] = (obj[arr[i]] || 0) + 1; // count occurrences
    }
    return obj;
  }

  // get specific from everything
  function getCount(word, arr) {
    return getCounts(arr)[word] || 0;
  }
};

export default {
  setConf,
  draw,
};
