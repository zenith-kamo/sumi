(function defineLiquidGlassLibrary(globalObject, createLibrary) {
  const libraryApi = createLibrary();
  if (typeof module === 'object' && module.exports) {
    module.exports = libraryApi;
  }
  globalObject.LiquidGlass = libraryApi;
})(typeof self !== 'undefined' ? self : this, function createLibrary() {
  'use strict';
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  function clampNumber(value, minimum, maximum) {
    if (value < minimum) {
      return minimum;
    }
    if (value > maximum) {
      return maximum;
    }
    return value;
  }
  function detectRefractionSupport() {
    const userAgentData = navigator.userAgentData;
    if (!userAgentData) {
      return false;
    }
    for (const brand of userAgentData.brands) {
      if (brand.brand.includes('Chromium')) {
        return true;
      }
    }
    return false;
  }
  const supportsRefraction = detectRefractionSupport();
  if (supportsRefraction) {
    document.documentElement.classList.add('refract');
  } else {
    document.documentElement.classList.add('plain');
  }
  function createListenerGroup() {
    const abortController = new AbortController();
    return {
      listenerOptions: { signal: abortController.signal },
      removeAllListeners: function removeAllListeners() {
        abortController.abort();
      },
    };
  }
  function callIfFunction(callback, ...callbackArguments) {
    if (typeof callback === 'function') {
      callback(...callbackArguments);
    }
  }
  let createdFilterCount = 0;
  let svgFilterDefinitions = null;
  function getSvgFilterDefinitions() {
    if (svgFilterDefinitions !== null) {
      return svgFilterDefinitions;
    }
    const hiddenSvgElement = document.createElementNS(SVG_NAMESPACE, 'svg');
    hiddenSvgElement.setAttribute('width', '0');
    hiddenSvgElement.setAttribute('height', '0');
    hiddenSvgElement.style.position = 'absolute';
    svgFilterDefinitions = document.createElementNS(SVG_NAMESPACE, 'defs');
    hiddenSvgElement.appendChild(svgFilterDefinitions);
    document.body.appendChild(hiddenSvgElement);
    return svgFilterDefinitions;
  }
  function measureDistanceFromEdge(
    offsetFromCenterX,
    offsetFromCenterY,
    halfWidth,
    halfHeight,
    cornerRadius
  ) {
    const beyondStraightEdgeX = Math.abs(offsetFromCenterX) - (halfWidth - cornerRadius);
    const beyondStraightEdgeY = Math.abs(offsetFromCenterY) - (halfHeight - cornerRadius);
    const distanceOutsideCorner = Math.hypot(
      Math.max(beyondStraightEdgeX, 0),
      Math.max(beyondStraightEdgeY, 0)
    );
    const distanceInsideShape = Math.min(Math.max(beyondStraightEdgeX, beyondStraightEdgeY), 0);
    const signedDistance = distanceOutsideCorner + distanceInsideShape - cornerRadius;
    let outwardNormalX = 0;
    let outwardNormalY = 0;
    const isInRoundedCorner = beyondStraightEdgeX > 0 && beyondStraightEdgeY > 0;
    if (isInRoundedCorner) {
      const vectorLength = Math.hypot(beyondStraightEdgeX, beyondStraightEdgeY) || 1;
      outwardNormalX = (Math.sign(offsetFromCenterX) * beyondStraightEdgeX) / vectorLength;
      outwardNormalY = (Math.sign(offsetFromCenterY) * beyondStraightEdgeY) / vectorLength;
    } else if (beyondStraightEdgeX > beyondStraightEdgeY) {
      outwardNormalX = Math.sign(offsetFromCenterX);
    } else {
      outwardNormalY = Math.sign(offsetFromCenterY);
    }
    return {
      distanceFromEdge: -signedDistance,
      outwardNormalX: outwardNormalX,
      outwardNormalY: outwardNormalY,
    };
  }
  function calculateRefractionStrength(distanceFromEdge, edgeWidth) {
    const isOutsideRefractingArea = distanceFromEdge < 0 || distanceFromEdge >= edgeWidth;
    if (isOutsideRefractingArea) {
      return 0;
    }
    const closenessToEdge = 1 - distanceFromEdge / edgeWidth;
    const smoothedCloseness = closenessToEdge * closenessToEdge * (3 - 2 * closenessToEdge);
    return smoothedCloseness * closenessToEdge;
  }
  function createDisplacementMapImage(width, height, cornerRadius, edgeWidth) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const canvasContext = canvas.getContext('2d');
    const imageData = canvasContext.createImageData(width, height);
    const pixelValues = imageData.data;
    for (let pixelRow = 0; pixelRow < height; pixelRow++) {
      for (let pixelColumn = 0; pixelColumn < width; pixelColumn++) {
        const offsetFromCenterX = pixelColumn + 0.5 - width / 2;
        const offsetFromCenterY = pixelRow + 0.5 - height / 2;
        const edgeMeasurement = measureDistanceFromEdge(
          offsetFromCenterX,
          offsetFromCenterY,
          width / 2,
          height / 2,
          cornerRadius
        );
        const refractionStrength = calculateRefractionStrength(
          edgeMeasurement.distanceFromEdge,
          edgeWidth
        );
        const firstValueIndex = (pixelRow * width + pixelColumn) * 4;
        pixelValues[firstValueIndex] = 128 - edgeMeasurement.outwardNormalX * refractionStrength * 127;
        pixelValues[firstValueIndex + 1] = 128 - edgeMeasurement.outwardNormalY * refractionStrength * 127;
        pixelValues[firstValueIndex + 2] = 128;
        pixelValues[firstValueIndex + 3] = 255;
      }
    }
    canvasContext.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }
  function createSvgRefractionFilter() {
    createdFilterCount = createdFilterCount + 1;
    const filterElement = document.createElementNS(SVG_NAMESPACE, 'filter');
    filterElement.id = 'liquid-glass-filter-' + createdFilterCount;
    filterElement.setAttribute('color-interpolation-filters', 'sRGB');
    filterElement.setAttribute('x', '0');
    filterElement.setAttribute('y', '0');
    filterElement.setAttribute('width', '100%');
    filterElement.setAttribute('height', '100%');
    const displacementMapImageElement = document.createElementNS(SVG_NAMESPACE, 'feImage');
    displacementMapImageElement.setAttribute('result', 'displacementMap');
    displacementMapImageElement.setAttribute('preserveAspectRatio', 'none');
    const displacementElement = document.createElementNS(SVG_NAMESPACE, 'feDisplacementMap');
    displacementElement.setAttribute('in', 'SourceGraphic');
    displacementElement.setAttribute('in2', 'displacementMap');
    displacementElement.setAttribute('xChannelSelector', 'R');
    displacementElement.setAttribute('yChannelSelector', 'G');
    filterElement.appendChild(displacementMapImageElement);
    filterElement.appendChild(displacementElement);
    getSvgFilterDefinitions().appendChild(filterElement);
    return {
      filterElement: filterElement,
      displacementMapImageElement: displacementMapImageElement,
      displacementElement: displacementElement,
    };
  }
  function applyGlassEffect(element, options) {
    const effectOptions = options || {};
    const listenerGroup = createListenerGroup();
    element.addEventListener(
      'pointermove',
      function moveHighlightToPointer(pointerEvent) {
        const boundingRect = element.getBoundingClientRect();
        const pointerXPercent = ((pointerEvent.clientX - boundingRect.left) / boundingRect.width) * 100;
        const pointerYPercent = ((pointerEvent.clientY - boundingRect.top) / boundingRect.height) * 100;
        element.style.setProperty('--lx', pointerXPercent + '%');
        element.style.setProperty('--ly', pointerYPercent + '%');
      },
      listenerGroup.listenerOptions
    );
    if (!supportsRefraction) {
      return {
        updateRefraction: function doNothing() {},
        destroy: listenerGroup.removeAllListeners,
      };
    }
    const refractionFilter = createSvgRefractionFilter();
    element.style.setProperty('--f', 'url(#' + refractionFilter.filterElement.id + ')');
    function readCornerRadius(elementWidth, elementHeight) {
      let requestedRadius;
      if (effectOptions.cornerRadius !== undefined) {
        requestedRadius = effectOptions.cornerRadius;
      } else if (element.dataset.r) {
        requestedRadius = Number(element.dataset.r);
      } else {
        requestedRadius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      }
      return Math.min(requestedRadius, elementWidth / 2, elementHeight / 2);
    }
    function readEdgeWidth(elementWidth, elementHeight) {
      if (effectOptions.edgeWidth !== undefined) {
        return effectOptions.edgeWidth;
      }
      if (element.dataset.b) {
        return Number(element.dataset.b);
      }
      return Math.min(Math.min(elementWidth, elementHeight) / 2, 26);
    }
    function updateRefraction() {
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;
      if (elementWidth === 0 || elementHeight === 0) {
        return;
      }
      const cornerRadius = readCornerRadius(elementWidth, elementHeight);
      const edgeWidth = readEdgeWidth(elementWidth, elementHeight);
      const maximumDisplacement = edgeWidth * 2.2;
      refractionFilter.displacementMapImageElement.setAttribute('width', elementWidth);
      refractionFilter.displacementMapImageElement.setAttribute('height', elementHeight);
      refractionFilter.displacementMapImageElement.setAttribute(
        'href',
        createDisplacementMapImage(elementWidth, elementHeight, cornerRadius, edgeWidth)
      );
      refractionFilter.displacementElement.setAttribute('scale', maximumDisplacement);
    }
    let isUpdateScheduled = false;
    const resizeObserver = new ResizeObserver(function scheduleRefractionUpdate() {
      if (isUpdateScheduled) {
        return;
      }
      isUpdateScheduled = true;
      requestAnimationFrame(function runScheduledUpdate() {
        isUpdateScheduled = false;
        updateRefraction();
      });
    });
    resizeObserver.observe(element);
    return {
      updateRefraction: updateRefraction,
      destroy: function destroyGlassEffect() {
        resizeObserver.disconnect();
        listenerGroup.removeAllListeners();
        refractionFilter.filterElement.remove();
        element.style.removeProperty('--f');
      },
    };
  }
  function enablePressEffect(element, options) {
    const effectOptions = options || {};
    const pressScale = effectOptions.pressScale !== undefined ? effectOptions.pressScale : 1.12;
    const holdScale = effectOptions.holdScale !== undefined ? effectOptions.holdScale : 1.24;
    const holdDelayMs = effectOptions.holdDelayMs !== undefined ? effectOptions.holdDelayMs : 480;
    const listenerGroup = createListenerGroup();
    let isPointerDown = false;
    let currentBaseScale = pressScale;
    let holdTimerId = null;
    function deformTowardPointer(pointerEvent) {
      const boundingRect = element.getBoundingClientRect();
      const pointerOffsetX = pointerEvent.clientX - (boundingRect.left + boundingRect.width / 2);
      const pointerOffsetY = pointerEvent.clientY - (boundingRect.top + boundingRect.height / 2);
      const shorterSide = Math.min(boundingRect.width, boundingRect.height);
      const horizontalStretch = clampNumber((Math.abs(pointerOffsetX) / boundingRect.width) * 0.16, 0, 0.1);
      const verticalSquash = clampNumber((Math.abs(pointerOffsetX) / boundingRect.width) * 0.05, 0, 0.05);
      const verticalStretch = clampNumber((Math.abs(pointerOffsetY) / shorterSide) * 0.04, 0, 0.05);
      element.style.setProperty('--tx', clampNumber(pointerOffsetX * 0.1, -14, 14) + 'px');
      element.style.setProperty('--ty', clampNumber(pointerOffsetY * 0.1, -10, 10) + 'px');
      element.style.setProperty('--sx', currentBaseScale + horizontalStretch);
      element.style.setProperty('--sy', currentBaseScale - verticalSquash + verticalStretch);
    }
    function handlePointerDown(pointerEvent) {
      isPointerDown = true;
      currentBaseScale = pressScale;
      element.setPointerCapture(pointerEvent.pointerId);
      element.classList.add('pressing');
      deformTowardPointer(pointerEvent);
      holdTimerId = setTimeout(function handleHoldDetected() {
        currentBaseScale = holdScale;
        element.classList.add('hold');
        deformTowardPointer(pointerEvent);
        element.dispatchEvent(new Event('hold'));
        callIfFunction(effectOptions.onHold);
      }, holdDelayMs);
    }
    function handlePointerMove(pointerEvent) {
      if (isPointerDown) {
        deformTowardPointer(pointerEvent);
      }
    }
    function handlePointerRelease() {
      isPointerDown = false;
      clearTimeout(holdTimerId);
      element.classList.remove('pressing');
      element.classList.remove('hold');
      const temporaryStyleNames = ['--tx', '--ty', '--sx', '--sy'];
      for (const styleName of temporaryStyleNames) {
        element.style.removeProperty(styleName);
      }
    }
    element.addEventListener('pointerdown', handlePointerDown, listenerGroup.listenerOptions);
    element.addEventListener('pointermove', handlePointerMove, listenerGroup.listenerOptions);
    element.addEventListener('pointerup', handlePointerRelease, listenerGroup.listenerOptions);
    element.addEventListener('pointercancel', handlePointerRelease, listenerGroup.listenerOptions);
    return { destroy: listenerGroup.removeAllListeners };
  }
  function createToggleSwitch(element, options) {
    const switchOptions = options || {};
    const listenerGroup = createListenerGroup();
    let hasBeenDragged = false;
    function readIsOn() {
      return element.classList.contains('on');
    }
    function setIsOn(newIsOn) {
      if (readIsOn() === newIsOn) {
        return;
      }
      if (newIsOn) {
        element.classList.add('on');
      } else {
        element.classList.remove('on');
      }
      callIfFunction(switchOptions.onChange, newIsOn);
    }
    if (switchOptions.isOn === true) {
      element.classList.add('on');
    }
    function setIsOnFromPointerPosition(pointerEvent) {
      const boundingRect = element.getBoundingClientRect();
      const centerX = boundingRect.left + boundingRect.width / 2;
      setIsOn(pointerEvent.clientX > centerX);
    }
    function handlePointerDown(pointerEvent) {
      element.setPointerCapture(pointerEvent.pointerId);
      element.classList.add('down');
      hasBeenDragged = false;
    }
    function handlePointerMove(pointerEvent) {
      if (!element.classList.contains('down')) {
        return;
      }
      hasBeenDragged = true;
      setIsOnFromPointerPosition(pointerEvent);
    }
    function handlePointerUp() {
      const wasJustTapped = !hasBeenDragged;
      if (wasJustTapped) {
        setIsOn(!readIsOn());
      }
      element.classList.remove('down');
    }
    function handlePointerCancel() {
      element.classList.remove('down');
    }
    element.addEventListener('pointerdown', handlePointerDown, listenerGroup.listenerOptions);
    element.addEventListener('pointermove', handlePointerMove, listenerGroup.listenerOptions);
    element.addEventListener('pointerup', handlePointerUp, listenerGroup.listenerOptions);
    element.addEventListener('pointercancel', handlePointerCancel, listenerGroup.listenerOptions);
    return {
      get isOn() {
        return readIsOn();
      },
      setIsOn: setIsOn,
      destroy: listenerGroup.removeAllListeners,
    };
  }
  const SLIDER_THUMB_WIDTH_PX = 44;
  function createRangeSlider(element, options) {
    const sliderOptions = options || {};
    const minimum = sliderOptions.minimum !== undefined ? sliderOptions.minimum : 0;
    const maximum = sliderOptions.maximum !== undefined ? sliderOptions.maximum : 100;
    const listenerGroup = createListenerGroup();
    let positionRatio = 0.5;
    function convertRatioToValue(ratio) {
      return minimum + ratio * (maximum - minimum);
    }
    function convertValueToRatio(value) {
      return (value - minimum) / (maximum - minimum);
    }
    function showPosition() {
      element.style.setProperty('--p', positionRatio);
    }
    function changePositionRatio(newRatio, shouldNotify) {
      positionRatio = clampNumber(newRatio, 0, 1);
      showPosition();
      if (shouldNotify) {
        callIfFunction(sliderOptions.onChange, convertRatioToValue(positionRatio));
      }
    }
    function changePositionFromPointer(pointerEvent) {
      const boundingRect = element.getBoundingClientRect();
      const halfThumbWidth = SLIDER_THUMB_WIDTH_PX / 2;
      const movableWidth = boundingRect.width - SLIDER_THUMB_WIDTH_PX;
      const ratio = (pointerEvent.clientX - boundingRect.left - halfThumbWidth) / movableWidth;
      changePositionRatio(ratio, true);
    }
    if (sliderOptions.value !== undefined) {
      positionRatio = convertValueToRatio(sliderOptions.value);
    }
    showPosition();
    function handlePointerDown(pointerEvent) {
      element.setPointerCapture(pointerEvent.pointerId);
      element.classList.add('drag');
      changePositionFromPointer(pointerEvent);
    }
    function handlePointerMove(pointerEvent) {
      if (element.classList.contains('drag')) {
        changePositionFromPointer(pointerEvent);
      }
    }
    function handlePointerRelease() {
      element.classList.remove('drag');
    }
    element.addEventListener('pointerdown', handlePointerDown, listenerGroup.listenerOptions);
    element.addEventListener('pointermove', handlePointerMove, listenerGroup.listenerOptions);
    element.addEventListener('pointerup', handlePointerRelease, listenerGroup.listenerOptions);
    element.addEventListener('pointercancel', handlePointerRelease, listenerGroup.listenerOptions);
    return {
      get value() {
        return convertRatioToValue(positionRatio);
      },
      setValue: function setValue(newValue) {
        changePositionRatio(convertValueToRatio(newValue), false);
      },
      destroy: listenerGroup.removeAllListeners,
    };
  }
  function createSearchBox(rowElement, options) {
    const searchOptions = options || {};
    const searchFieldElement = rowElement.querySelector('.search');
    const textInputElement = rowElement.querySelector('input');
    const clearButtonElement = rowElement.querySelector('.x');
    const cancelButtonElement = rowElement.querySelector('.cancel');
    const listenerGroup = createListenerGroup();
    function setSearchText(newText) {
      textInputElement.value = newText;
      if (newText === '') {
        searchFieldElement.classList.remove('has');
      } else {
        searchFieldElement.classList.add('has');
      }
      callIfFunction(searchOptions.onInput, newText);
    }
    function handleTextInput() {
      setSearchText(textInputElement.value);
    }
    function handleClearButtonClick() {
      setSearchText('');
      textInputElement.focus();
    }
    function handleCancelButtonPointerDown(pointerEvent) {
      pointerEvent.preventDefault();
      setSearchText('');
      textInputElement.blur();
    }
    textInputElement.addEventListener('input', handleTextInput, listenerGroup.listenerOptions);
    clearButtonElement.addEventListener('click', handleClearButtonClick, listenerGroup.listenerOptions);
    cancelButtonElement.addEventListener('pointerdown', handleCancelButtonPointerDown, listenerGroup.listenerOptions);
    return {
      get searchText() {
        return textInputElement.value;
      },
      setSearchText: setSearchText,
      destroy: listenerGroup.removeAllListeners,
    };
  }
  function createSegmentedControl(element, options) {
    const controlOptions = options || {};
    const indicatorElement = element.querySelector('i');
    const segmentElements = Array.from(element.querySelectorAll('b'));
    const listenerGroup = createListenerGroup();
    let selectedIndex = 0;
    function selectIndex(requestedIndex, shouldNotify) {
      selectedIndex = clampNumber(requestedIndex, 0, segmentElements.length - 1);
      for (let segmentIndex = 0; segmentIndex < segmentElements.length; segmentIndex++) {
        if (segmentIndex === selectedIndex) {
          segmentElements[segmentIndex].classList.add('on');
        } else {
          segmentElements[segmentIndex].classList.remove('on');
        }
      }
      indicatorElement.style.left =
        'calc(3px + ' + selectedIndex + ' * (100% - 6px) / ' + segmentElements.length + ')';
      if (shouldNotify) {
        callIfFunction(controlOptions.onChange, selectedIndex);
      }
    }
    function selectIndexFromPointer(pointerEvent) {
      const boundingRect = element.getBoundingClientRect();
      const pointerRatio = (pointerEvent.clientX - boundingRect.left) / boundingRect.width;
      const pointedIndex = clampNumber(Math.floor(pointerRatio * segmentElements.length), 0, segmentElements.length - 1);
      if (pointedIndex !== selectedIndex) {
        selectIndex(pointedIndex, true);
      }
    }
    function handlePointerDown(pointerEvent) {
      element.setPointerCapture(pointerEvent.pointerId);
      element.classList.add('down');
      selectIndexFromPointer(pointerEvent);
    }
    function handlePointerMove(pointerEvent) {
      if (element.classList.contains('down')) {
        selectIndexFromPointer(pointerEvent);
      }
    }
    function handlePointerRelease() {
      element.classList.remove('down');
    }
    element.addEventListener('pointerdown', handlePointerDown, listenerGroup.listenerOptions);
    element.addEventListener('pointermove', handlePointerMove, listenerGroup.listenerOptions);
    element.addEventListener('pointerup', handlePointerRelease, listenerGroup.listenerOptions);
    element.addEventListener('pointercancel', handlePointerRelease, listenerGroup.listenerOptions);
    if (controlOptions.selectedIndex !== undefined) {
      selectIndex(controlOptions.selectedIndex, false);
    }
    return {
      get selectedIndex() {
        return selectedIndex;
      },
      selectIndex: function selectIndexFromOutside(requestedIndex) {
        selectIndex(requestedIndex, false);
      },
      destroy: listenerGroup.removeAllListeners,
    };
  }
  function createTabBar(element, options) {
    const tabBarOptions = options || {};
    const indicatorElement = element.querySelector('i');
    const tabElements = Array.from(element.querySelectorAll('b'));
    const listenerGroup = createListenerGroup();
    let selectedIndex = 0;
    function selectIndex(requestedIndex, shouldNotify) {
      selectedIndex = clampNumber(requestedIndex, 0, tabElements.length - 1);
      indicatorElement.style.left =
        'calc(5px + ' + selectedIndex + ' * (100% - 10px) / ' + tabElements.length + ')';
      if (shouldNotify) {
        callIfFunction(tabBarOptions.onChange, selectedIndex);
      }
    }
    tabElements.forEach(function addClickListener(tabElement, tabIndex) {
      tabElement.addEventListener(
        'click',
        function handleTabClick() {
          selectIndex(tabIndex, true);
        },
        listenerGroup.listenerOptions
      );
    });
    return {
      get selectedIndex() {
        return selectedIndex;
      },
      selectIndex: function selectIndexFromOutside(requestedIndex) {
        selectIndex(requestedIndex, false);
      },
      destroy: listenerGroup.removeAllListeners,
    };
  }
  function createLongPressMenu(triggerElement, menuElement, options) {
    const menuOptions = options || {};
    const listenerGroup = createListenerGroup();
    function openMenu() {
      menuElement.classList.add('show');
    }
    function closeMenu() {
      menuElement.classList.remove('show');
    }
    function handleOutsidePointerDown(pointerEvent) {
      const isInsideMenu = menuElement.contains(pointerEvent.target);
      const isOnTrigger = triggerElement.contains(pointerEvent.target);
      if (!isInsideMenu && !isOnTrigger) {
        closeMenu();
      }
    }
    function handleMenuClick(clickEvent) {
      const menuItems = Array.from(menuElement.children);
      for (let itemIndex = 0; itemIndex < menuItems.length; itemIndex++) {
        if (menuItems[itemIndex].contains(clickEvent.target)) {
          callIfFunction(menuOptions.onSelect, itemIndex, menuItems[itemIndex]);
          break;
        }
      }
      closeMenu();
    }
    triggerElement.addEventListener('hold', openMenu, listenerGroup.listenerOptions);
    document.addEventListener('pointerdown', handleOutsidePointerDown, listenerGroup.listenerOptions);
    menuElement.addEventListener('click', handleMenuClick, listenerGroup.listenerOptions);
    return {
      open: openMenu,
      close: closeMenu,
      destroy: listenerGroup.removeAllListeners,
    };
  }
  function makeElementDraggable(element) {
    const listenerGroup = createListenerGroup();
    let isDragging = false;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    function handlePointerDown(pointerEvent) {
      isDragging = true;
      element.setPointerCapture(pointerEvent.pointerId);
      element.style.cursor = 'grabbing';
      const boundingRect = element.getBoundingClientRect();
      grabOffsetX = pointerEvent.clientX - boundingRect.left;
      grabOffsetY = pointerEvent.clientY - boundingRect.top;
    }
    function handlePointerMove(pointerEvent) {
      if (!isDragging) {
        return;
      }
      const parentRect = element.offsetParent.getBoundingClientRect();
      const leftInParent = pointerEvent.clientX - parentRect.left - grabOffsetX;
      const topInParent = pointerEvent.clientY - parentRect.top - grabOffsetY;
      const maximumLeft = parentRect.width - element.offsetWidth + 10;
      element.style.left = clampNumber(leftInParent, -10, maximumLeft) + 'px';
      element.style.top = topInParent + 'px';
      element.style.right = 'auto';
    }
    function handlePointerRelease() {
      isDragging = false;
      element.style.cursor = 'grab';
    }
    element.addEventListener('pointerdown', handlePointerDown, listenerGroup.listenerOptions);
    element.addEventListener('pointermove', handlePointerMove, listenerGroup.listenerOptions);
    element.addEventListener('pointerup', handlePointerRelease, listenerGroup.listenerOptions);
    element.addEventListener('pointercancel', handlePointerRelease, listenerGroup.listenerOptions);
    return { destroy: listenerGroup.removeAllListeners };
  }
  function setupAll(rootElement) {
    const searchRoot = rootElement || document;
    function findElements(selector) {
      return Array.from(searchRoot.querySelectorAll(selector));
    }
    return {
      glassEffects: findElements('.glass').map(function (element) {
        return applyGlassEffect(element);
      }),
      pressEffects: findElements('.press').map(function (element) {
        return enablePressEffect(element);
      }),
      toggleSwitches: findElements('.toggle').map(function (element) {
        return createToggleSwitch(element);
      }),
      rangeSliders: findElements('.range').map(function (element) {
        return createRangeSlider(element);
      }),
      searchBoxes: findElements('.searchrow').map(function (element) {
        return createSearchBox(element);
      }),
      segmentedControls: findElements('.seg').map(function (element) {
        return createSegmentedControl(element);
      }),
      tabBars: findElements('.tabbar').map(function (element) {
        return createTabBar(element);
      }),
      draggableElements: findElements('.lens').map(function (element) {
        return makeElementDraggable(element);
      }),
    };
  }
  return {
    supportsRefraction: supportsRefraction,
    applyGlassEffect: applyGlassEffect,
    enablePressEffect: enablePressEffect,
    createToggleSwitch: createToggleSwitch,
    createRangeSlider: createRangeSlider,
    createSearchBox: createSearchBox,
    createSegmentedControl: createSegmentedControl,
    createTabBar: createTabBar,
    createLongPressMenu: createLongPressMenu,
    makeElementDraggable: makeElementDraggable,
    setupAll: setupAll,
  };
});