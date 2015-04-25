// NAME:
// 	Export Layers To Files

// DESCRIPTION:
//  Improved version of the built-in "Export Layers To Files" script:
//  * Supports PNG and possibly other formats in the future.
//  * Does not create multiple document duplicates, so it's much faster.
//	Saves each layer in the active document to a file in a preferred format named after the layer. Supported formats:
//  * PNG
//  * JPEG
//  * Targa
//  * BMP

// REQUIRES:
// 	Adobe Photoshop CS2 or higher

// Most current version always available at: https://github.com/hsw107/Photoshop-Export-Layers-as-Images

// enable double-clicking from Finder/Explorer (CS2 and higher)
#target photoshop
app.bringToFront();

//
// Type definitions
//

const FileNameType = {
	AS_LAYERS: 1,
	INDEX_ASC: 2,
	INDEX_DESC: 3,
	AS_LAYERS_NO_EXT: 4,

	forIndex: function(index) {
		var values = [this.AS_LAYERS_NO_EXT, this.AS_LAYERS, this.INDEX_DESC, this.INDEX_ASC];
		return values[index];
	}
};

const LetterCase = {
	KEEP: 1,
	LOWERCASE: 2,
	UPPERCASE: 3,

	forIndex: function(index) {
		var values = [this.KEEP, this.LOWERCASE, this.UPPERCASE];
		return values[index];
	},

	toExtensionType: function(value) {
		switch (value) {

		case this.KEEP:
			return Extension.NONE;

		case this.LOWERCASE:
			return Extension.LOWERCASE;

		case this.UPPERCASE:
			return Extension.UPPERCASE;

		default:
			return Extension.NONE;
		}
	}
};

const TrimPrefType = {
	DONT_TRIM: 1,
	INDIVIDUAL: 2,
	COMBINED: 3,

	forIndex: function(index) {
		var values = [this.DONT_TRIM, this.INDIVIDUAL, this.COMBINED];
		return values[index];
	}
};

//Settings//
const DEFAULT_SETTINGS = {
	exportAll: app.stringIDToTypeID( "exportAll" ),
	nameFiles: app.stringIDToTypeID( "nameFiles" ),
	allowSpaces: app.stringIDToTypeID( "allowSpaces" ),
	letterCase:	app.stringIDToTypeID( "letterCase" ),
	outputPrefix: app.stringIDToTypeID( "outputPrefix" ),
	trim: app.stringIDToTypeID( "trim" ),
	exportBackground: app.stringIDToTypeID( "exportBackground" ),
	fileType: app.stringIDToTypeID( "fileType" ),
	png24 : {
		matte: app.stringIDToTypeID( "png24Matte" ),
		transparency: app.stringIDToTypeID( "png24Transparency" ),
		interlaced: app.stringIDToTypeID( "png24Interlaced" ),
	},
	png8: {
		colorReduction: app.stringIDToTypeID( "png8ColorReduction" ),
		numberOfColors: app.stringIDToTypeID( "png8NumberOfColors" ),
		dither: app.stringIDToTypeID( "png8Dither" ),
		ditherAmount: app.stringIDToTypeID( "png8DitherAmount" ),
		interlaced: app.stringIDToTypeID( "png8Interlaced" ),
		transparency: app.stringIDToTypeID( "png8Transparency" ),
		matte: app.stringIDToTypeID( "png8Matte" ),
		transparencyDither: app.stringIDToTypeID( "png8TransparencyDither" ),
		transparencyDitherAmount: app.stringIDToTypeID( "png8TransparencyDitherAmount" )
	},
	jpg: {
		quality: app.stringIDToTypeID( "jpgQuality" ),
		matte: app.stringIDToTypeID( "jpgMatte" ),
		icc: app.stringIDToTypeID( "jpgIcc" ),
		optimized: app.stringIDToTypeID( "jpgOptimized" ),
		progressive: app.stringIDToTypeID( "jpgProgressive" )
	},
	tga: {
		depth: app.stringIDToTypeID( "tgaDepth" ),
		alpha: app.stringIDToTypeID( "tgaAlpha" ),
		rle: app.stringIDToTypeID( "tgaRle" )
	},
	bmp: {
		alpha: app.stringIDToTypeID( "bmpAlpha" ),
		rle: app.stringIDToTypeID( "bmpRle" ),
		flipRow: app.stringIDToTypeID( "bmpFlipRow" ),
         depth: app.stringIDToTypeID( "bmpDepth" ),
	}
};
const USER_SETTINGS_ID = "exportLayersToFilesCustomDefaultSettings";  	
//
// Global variables
//

var env = new Object();
env.profiling = false;

var prefs = new Object();
var userCancelled = false;
var layers;
var visibleLayers;
var groups;
var layerCount = 0;
var visibleLayerCount = 0;


//
// Entry point
//

bootstrap();

//
// Processing logic
//

function main()
{
	// user preferences
	prefs = new Object();
	prefs.format = "";
	prefs.fileExtension = "";
	try {
		prefs.filePath = app.activeDocument.path;
	}
	catch (e) {
		prefs.filePath = Folder.myDocuments;
	}
	prefs.formatArgs = null;
	prefs.visibleOnly = false;
	prefs.outputPrefix = "";
	prefs.naming = FileNameType.AS_LAYERS_NO_EXT;
	prefs.namingLetterCase = LetterCase.KEEP;
	prefs.replaceSpaces = true;
	prefs.bgLayer = false;
	prefs.trim = TrimPrefType.DONT_TRIM;

	userCancelled = false;

	// create progress bar
	var progressBarWindow = createProgressBar();
	if (! progressBarWindow) {
		return "cancel";
	}

	// count layers
	var profiler = new Profiler(env.profiling);
	var layerCountResult = countLayers(progressBarWindow);
	if (userCancelled) {
		return "cancel";
	}
	layerCount = layerCountResult.layerCount;
	visibleLayerCount = layerCountResult.visibleLayerCount;
	var countDuration = profiler.getDuration(true, true);
	if (env.profiling) {
		alert("Layers counted in " + profiler.format(countDuration), "Debug info");
	}

	// show dialogue
	if (showDialog()) {
		env.documentCopy = app.activeDocument.duplicate();

		// collect layers
		profiler.resetLastTime();
		var collected = collectLayers(progressBarWindow);
		if (userCancelled) {
			alert("Export cancelled! No files saved.", "Finished", false);
			return "cancel";
		}
		layers = collected.layers;
		visibleLayers = collected.visibleLayers;
		groups = collected.groups;
		var collectionDuration = profiler.getDuration(true, true);
		if (env.profiling) {
			alert("Layers collected in " + profiler.format(collectionDuration), "Debug info");
		}

		// export
		profiler.resetLastTime();

		var count = exportLayers(prefs.visibleOnly, progressBarWindow);
		var exportDuration = profiler.getDuration(true, true);

		var message = "";
		if (userCancelled) {
			message += "Export cancelled!\n\n";
		}
		message += "Saved " + count.count + " files.";
		if (env.profiling) {
			message += "\n\nExport function took " + profiler.format(collectionDuration) + " + " + profiler.format(exportDuration) + " to perform.";
		}
		if (count.error) {
			message += "\n\nSome layers failed to export! (Are there many layers with the same name?)";
		}
		alert(message, "Finished", count.error);

		app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
		env.documentCopy = null;
	}
	else {
		return "cancel";
	}
}

function exportLayers(visibleOnly, progressBarWindow)
{
	var retVal = {
		count: 0,
		error: false
	};
	var doc = app.activeDocument;

	var layerCount = layers.length;

	if ((layerCount == 1) && layers[0].layer.isBackgroundLayer) {
		// Flattened images don't support LayerComps or visibility toggling, so export it directly.
		if (saveImage(layers[0].layer.name)) {
			++retVal.count;
		}
		else {
			retVal.error = true;
		}
	}
	else {
		var layersToExport = visibleOnly ? visibleLayers : layers;
		const count = prefs.bgLayer ? layersToExport.length - 1 : layersToExport.length;

		// Single trim of all layers combined.
		if (prefs.trim == TrimPrefType.COMBINED) {
			const UPDATE_NUM = 20;
			if (progressBarWindow) {
				var stepCount = visibleOnly ? 1 : count / UPDATE_NUM + 1;
				showProgressBar(progressBarWindow, "Trimming...", stepCount);
			}

			if (! visibleOnly) {
				// For combined trim across all layers, make all layers visible.
				for (var i = 0; i < count; ++i) {
					makeVisible(layersToExport[i]);

					if (progressBarWindow && (i % UPDATE_NUM == 0)) {
						updateProgressBar(progressBarWindow);
						repaintProgressBar(progressBarWindow);
						if (userCancelled) {
							progressBarWindow.hide();
							return retVal;
						}
					}
				}
			}

			if (prefs.bgLayer) {
				layersToExport[count].layer.visible = false;
			}

			doc.trim(TrimType.TRANSPARENT);
		}

		if (progressBarWindow) {
			showProgressBar(progressBarWindow, "Exporting 1 of " + count + "...", count);
		}

		// Turn off all layers when exporting all layers - even seemingly invisible ones.
		// When visibility is switched, the parent group becomes visible and a previously invisible child may become visible by accident.
		for (var i = 0; i < count; ++i) {
			layersToExport[i].layer.visible = false;
		}
		if (prefs.bgLayer) {
			makeVisible(layersToExport[count]);
		}

		var countDigits = 0;
		if (prefs.naming != FileNameType.AS_LAYERS) {
			countDigits = ("" + count).length;
		}

		// export layers
		for (var i = 0; i < count; ++i) {
			var layer = layersToExport[i].layer;

			var fileName;
			switch (prefs.naming) {

			case FileNameType.AS_LAYERS_NO_EXT:
				fileName = makeFileNameFromLayerName(layer, true);
				break;

			case FileNameType.AS_LAYERS:
				fileName = makeFileNameFromLayerName(layer, false);
				break;

			case FileNameType.INDEX_ASC:
				fileName = makeFileNameFromIndex(count - i, countDigits);
				break;

			case FileNameType.INDEX_DESC:
				fileName = makeFileNameFromIndex(i + 1, countDigits);
				break;
			}

			if (fileName) {
				makeVisible(layersToExport[i]);

				if (prefs.trim == TrimPrefType.INDIVIDUAL) {
					doc.crop(layer.bounds);
				}

				saveImage(fileName);
				++retVal.count;

				if (prefs.trim == TrimPrefType.INDIVIDUAL) {
					undo(doc);
				}

				layer.visible = false;
			}
			else {
				retVal.error = true;
			}

			if (progressBarWindow) {
				updateProgressBar(progressBarWindow, "Exporting " + (i + 1) + " of " + count + "...");
				repaintProgressBar(progressBarWindow);
				if (userCancelled) {
					break;
				}
			}
		}

		if (progressBarWindow) {
			progressBarWindow.hide();
		}
	}

	return retVal;
}

function saveImage(fileName)
{
	if (prefs.formatArgs instanceof ExportOptionsSaveForWeb) {
		// Document.exportDocument() is unreliable -- it ignores some of the export options.
		// Avoid it if possible.
		switch (prefs.format) {

		case "PNG-24":
			exportPng24AM(fileName, prefs.formatArgs);
			break;

		case "PNG-8":
			exportPng8AM(fileName, prefs.formatArgs);
			break;

		default:
			app.activeDocument.exportDocument(fileName, ExportType.SAVEFORWEB, prefs.formatArgs);
			break;
		}
	}
	else {
		app.activeDocument.saveAs(fileName, prefs.formatArgs, true, LetterCase.toExtensionType(prefs.namingLetterCase));
	}

	return true;
}

function makeFileNameFromIndex(index, numOfDigits)
{
	var fileName = "" + padder(index, numOfDigits);
	return getUniqueFileName(fileName);
}

function makeFileNameFromLayerName(layer, stripExt)
{
	var fileName = makeValidFileName(layer.name, prefs.replaceSpaces);
	if (stripExt) {
		var dotIdx = fileName.indexOf('.');
		if (dotIdx >= 0) {
			fileName = fileName.substring(0, dotIdx);
		}
	}	
	if (fileName.length == 0) {
		fileName = "Layer";
	}
	return getUniqueFileName(fileName);
}

function getUniqueFileName(fileName)
{
	var ext = prefs.fileExtension;
	// makeValidFileName() here basically just converts the space between the prefix and the core file name,
	// but it's a good idea to keep file naming conventions in one place, i.e. inside makeValidFileName(),
	// and rely on them exclusively.
	fileName = makeValidFileName(prefs.outputPrefix + fileName, prefs.replaceSpaces);
	if (prefs.namingLetterCase == LetterCase.LOWERCASE) {
		fileName = fileName.toLowerCase();
		ext = ext.toLowerCase();
	}
	else if (prefs.namingLetterCase == LetterCase.UPPERCASE) {
		fileName = fileName.toUpperCase();
		ext = ext.toUpperCase();
	}
	fileName = prefs.filePath + "/" + fileName;

	// Check if the file already exists. In such case a numeric suffix will be added to disambiguate.
	var uniqueName = fileName;
	for (var i = 1; i <= 100; ++i) {
		var handle = File(uniqueName + ext);
		if (handle.exists) {
			uniqueName = fileName + "-" + padder(i, 3);
		}
		else {
			return handle;
		}
	}

	return false;
}

function forEachLayer(inCollection, doFunc, result, traverseInvisibleSets)
{
	var length = inCollection.length;
	for (var i = 0; i < length; ++i) {
		var layer = inCollection[i];
		if (layer.typename == "LayerSet") {
			if (traverseInvisibleSets || layer.visible) {
				result = forEachLayer(layer.layers, doFunc, result, traverseInvisibleSets);
			}
		}
		else {
			result = doFunc(layer, result);
		}
	}

	return result;
}

// Indexed access to Layers via the default provided API is very slow, so all layers should be
// collected into a separate collection beforehand and that should be accessed repeatedly.
function collectLayers(progressBarWindow)
{
	// proxy to lower level ActionManager code
	return collectLayersAM(progressBarWindow);
}

function countLayers(progressBarWindow)
{
	// proxy to lower level ActionManager code
	return countLayersAM(progressBarWindow);
}

function undo(doc)
{
	doc.activeHistoryState = doc.historyStates[doc.historyStates.length-2];
}

function makeVisible(layer)
{
	layer.layer.visible = true;

	var current = layer.parent;
	while (current) {
		if (! current.layer.visible) {
			current.layer.visible = true;
		}
		current = current.parent;
	}
}

function isAdjustmentLayer(layer)
{
	switch (layer.kind) {

	case LayerKind.BRIGHTNESSCONTRAST:
	case LayerKind.CHANNELMIXER:
	case LayerKind.COLORBALANCE:
	case LayerKind.CURVES:
	case LayerKind.GRADIENTMAP:
	case LayerKind.HUESATURATION:
	case LayerKind.INVERSION:
	case LayerKind.LEVELS:
	case LayerKind.POSTERIZE:
	case LayerKind.SELECTIVECOLOR:
	case LayerKind.THRESHOLD:
		return true;

	default:
		return false;
	}

}

//
// User interface
//

function createProgressBar()
{
	// read progress bar resource
	var rsrcFile = new File(env.scriptFileDirectory + "/progress_bar.json");
	var rsrcString = loadResource(rsrcFile);
	if (! rsrcString) {
		return false;
	}

	// create window
	var win;
	try {
		win = new Window(rsrcString);
	}
	catch (e) {
		alert("Progress bar resource is corrupt! Please, redownload the script with all files.", "Error", true);
		return false;
	}

	win.barRow.cancelBtn.onClick = function() {
		userCancelled = true;
	};
	
	win.onResizing = win.onResize = function () {
		this.layout.resize();
	}
	
	win.onClose = function() {
		userCancelled = true;
		return false;
	};
	return win;
}

function showProgressBar(win, message, maxValue)
{
	win.lblMessage.text = message;
	win.barRow.bar.maxvalue = maxValue;
	win.barRow.bar.value = 0;

	win.center();
	win.show();
	repaintProgressBar(win, true);
}

function updateProgressBar(win, message)
{
	++win.barRow.bar.value;
	if (message) {
		win.lblMessage.text = message;
	}
}

function repaintProgressBar(win, force /* = false*/)
{
	if (env.version >= 11) {	// CS4 added support for UI updates; the previous method became unbearably slow, as is app.refresh()
		if (force) {
			app.refresh();
		}
		else {
			win.update();
		}
	}
	else {
		// CS3 and below
		var d = new ActionDescriptor();
		d.putEnumerated(app.stringIDToTypeID('state'), app.stringIDToTypeID('state'), app.stringIDToTypeID('redrawComplete'));
		app.executeAction(app.stringIDToTypeID('wait'), d, DialogModes.NO);
	}
}

function showDialog()
{
	// read dialog resource
	var rsrcFile = new File(env.scriptFileDirectory + "/dialog.json");
	var rsrcString = loadResource(rsrcFile);
	if (! rsrcString) {
		return false;
	}

	// build dialogue
	var dlg;
	try {
		dlg = new Window(rsrcString);
	}
	catch (e) {
		alert("Dialog resource is corrupt! Please, redownload the script with all files.", "Error", true);
		return false;
	}

	// destination path
	dlg.funcArea.content.grpDest.txtDest.text = prefs.filePath.fsName;
	dlg.funcArea.content.grpDest.btnDest.onClick = function() {
		var newFilePath = Folder.selectDialog("Select destination folder", prefs.filePath);
		if (newFilePath) {
			prefs.filePath = newFilePath;
			dlg.funcArea.content.grpDest.txtDest.text = newFilePath.fsName;
		}
	};

	// layer subset selection
	dlg.funcArea.content.grpLayers.radioLayersAll.onClick = function() {
		prefs.visibleOnly = false;
		dlg.funcArea.content.cbBgLayer.enabled = (layerCount > 1);
	};
	dlg.funcArea.content.grpLayers.radioLayersVis.onClick = function() {
		prefs.visibleOnly = true;
		dlg.funcArea.content.cbBgLayer.enabled = (visibleLayerCount > 1);
	};
	dlg.funcArea.content.grpLayers.radioLayersVis.enabled = (visibleLayerCount > 0);

	var formatDropDown = dlg.funcArea.content.grpFileType.drdFileType;
	var optionsPanel = dlg.funcArea.content.pnlOptions;

	// file type - call cloned getDialogParams*() for new file formats here
	// (add a single line, the rest is taken care of)
	var saveOpt = [];
	var paramFuncs = [getDialogParamsPNG24, getDialogParamsPNG8, getDialogParamsJPEG, getDialogParamsTarga, getDialogParamsBMP];
	for (var i = 0, len = paramFuncs.length; i < len; ++i) {
		var optionsRoot = optionsPanel.add("group");
		optionsRoot.orientation = "column";
		optionsRoot.alignChildren = "left";
		var opts = paramFuncs[i](optionsRoot);
		opts.controlRoot = optionsRoot;
		saveOpt.push(opts);

		formatDropDown.add("item", saveOpt[i].type);
	}

	// show proper file type options
	formatDropDown.onChange = function() {
		// Note: There's a bug in CS5 and CC where ListItem.selected doesn't report correct value in onChange().
		// A workaround is to rely on DropDownList.selection instead.
		for (var i = saveOpt.length - 1; i >= 0; --i) {
			saveOpt[i].controlRoot.hide();
		}
		saveOpt[this.selection.index].controlRoot.show();
	};

	formatDropDown.selection = 0;

	// file name prefix
	dlg.funcArea.content.grpPrefix.editPrefix.onChange = function() {
		this.text = makeValidFileName(this.text, prefs.replaceSpaces);
	};

	// file naming options
	dlg.funcArea.content.grpNaming.drdNaming.selection = 0;
	dlg.funcArea.content.grpLetterCase.drdLetterCase.selection = 0;

	dlg.funcArea.content.grpNaming.cbNaming.onClick = function() {
		prefs.replaceSpaces = ! this.value;
	};

	// trimming
	dlg.funcArea.content.grpTrim.drdTrim.selection = 0;

	// background layer setting
	dlg.funcArea.content.cbBgLayer.enabled = (layerCount > 1);

	// buttons
	dlg.funcArea.buttons.btnRun.onClick = function() {
		// collect arguments for saving and proceed

		prefs.outputPrefix = dlg.funcArea.content.grpPrefix.editPrefix.text;
		if (prefs.outputPrefix.length > 0) {
			prefs.outputPrefix += " ";
		}

		prefs.naming = FileNameType.forIndex(dlg.funcArea.content.grpNaming.drdNaming.selection.index);
		prefs.namingLetterCase = LetterCase.forIndex(dlg.funcArea.content.grpLetterCase.drdLetterCase.selection.index);
		prefs.trim = TrimPrefType.forIndex(dlg.funcArea.content.grpTrim.drdTrim.selection.index);
		var cbBgLayer = dlg.funcArea.content.cbBgLayer;
		prefs.bgLayer = (cbBgLayer.value && cbBgLayer.enabled);

		var selIdx = formatDropDown.selection.index;
		saveOpt[selIdx].handler(saveOpt[selIdx].controlRoot);
		
		saveSettings(dlg, saveOpt);
		
		dlg.close(1);
	};
	dlg.funcArea.buttons.btnCancel.onClick = function() {
		dlg.close(0);
	};
	
	dlg.funcArea.buttons.btnSettings.enabled = env.cs3OrHigher;
	dlg.funcArea.buttons.btnSettings.onClick = function() {
		saveSettings(dlg, saveOpt);
		dlg.close(0);
	};

	// warning message
	dlg.warning.message.text = formatString(dlg.warning.message.text, layerCount, visibleLayerCount);
	
	applyDefaults(dlg, saveOpt);
	
	dlg.center();
	return dlg.show();
}

function applyDefaults(dlg, saveOpt)
{
	if (!env.cs3OrHigher) {
		return;
	}
	
	var settings = getSettings();
	if (settings == null) {
		return;
	}
	
    dlg.funcArea.content.grpLayers.radioLayersAll.value = settings.exportAll;
    dlg.funcArea.content.grpLayers.radioLayersVis.value = !settings.exportAll;
	dlg.funcArea.content.grpNaming.drdNaming.selection = settings.nameFiles;
    dlg.funcArea.content.grpNaming.cbNaming.value = settings.allowSpaces;
	dlg.funcArea.content.grpLetterCase.drdLetterCase.selection = settings.letterCase;
    dlg.funcArea.content.grpPrefix.editPrefix.text = settings.outputPrefix
	dlg.funcArea.content.grpTrim.drdTrim.selection = settings.trim;
    dlg.funcArea.content.cbBgLayer.value = settings.exportBackground;
    dlg.funcArea.content.grpFileType.drdFileType.selection = settings.fileType;
    var PNG24 = 0, PNG8 = 1, JPG = 2, TGA = 3, BMP = 4;
    if (settings.fileType == PNG24) { //PNG24
        saveOpt[PNG24].controlRoot.transparency.value =  settings.png24.transparency;
		if (settings.png24.transparency == false) {
			saveOpt[PNG24].controlRoot.matte.enabled = true;
			saveOpt[PNG24].controlRoot.matte.selection = settings.png24.matte;
		}
        saveOpt[PNG24].controlRoot.interlaced.value = settings.png24.interlaced;
    } 
	else if (settings.fileType == PNG8) { //PNG8
        saveOpt[PNG8].controlRoot.colourReduction.selection =  settings.png8.colorReduction;
        saveOpt[PNG8].controlRoot.colorsLast = settings.png8.numberOfColors;
        saveOpt[PNG8].controlRoot.dither.selection = settings.png8.dither;
        if (settings.png8.dither == 1) {
            saveOpt[PNG8].controlRoot.ditherAmount.enabled = true;
            saveOpt[PNG8].controlRoot.ditherAmount.value = settings.png8.ditherAmount;
        }
        saveOpt[PNG8].controlRoot.interlaced.value = settings.png8.interlaced;
        if (settings.png8.transparency == false) {
                saveOpt[PNG8].controlRoot.transparency.notify();
                saveOpt[PNG8].controlRoot.matte.selection = settings.png8.matte;
        } 
		else {
            saveOpt[PNG8].controlRoot.transparencyDither.selection = settings.png8.transparencyDither;
            if (settings.png8.transparencyDither == 1) {
                saveOpt[PNG8].controlRoot.transparencyDitherAmount.value = settings.png8.transparencyDitherAmount;
            }
        }    
    } 
	else if (settings.fileType == JPG) { //JPG
        saveOpt[JPG].controlRoot.quality.value =  settings.jpg.quality;
        saveOpt[JPG].controlRoot.matte.selection = settings.jpg.matte;
        saveOpt[JPG].controlRoot.icc.value = settings.jpg.icc;
        saveOpt[JPG].controlRoot.optimised.value = settings.jpg.optimized;
        saveOpt[JPG].controlRoot.progressive.value = settings.jpg.progressive;
        if (settings.jpg.progressive) { 
            saveOpt[JPG].controlRoot.optimised.enabled = false;
        }
    } 
	else if (settings.fileType == TGA) {
        saveOpt[TGA].controlRoot.alpha.value =  settings.tga.alpha;
        saveOpt[TGA].controlRoot.bitsPerPixel.selection = settings.tga.depth;
        saveOpt[TGA].controlRoot.rle.value = settings.tga.rle;
    } 
	else if (settings.fileType == BMP) {
        saveOpt[BMP].controlRoot.alpha.value =  settings.bmp.alpha;
        saveOpt[BMP].controlRoot.depth.selection = settings.bmp.depth;
        saveOpt[BMP].controlRoot.rle.value = settings.bmp.rle;
        saveOpt[BMP].controlRoot.flipRowOrder.value = settings.bmp.flipRow;
    }
}

function saveSettings(dlg, saveOpt)
{
	if (!env.cs3OrHigher) {
		return;
	}
	
	// Collect settings from the dialog controls.
	
	var desc = new ActionDescriptor();
	desc.putBoolean(DEFAULT_SETTINGS.exportAll, dlg.funcArea.content.grpLayers.radioLayersAll.value); 
	desc.putInteger(DEFAULT_SETTINGS.nameFiles, dlg.funcArea.content.grpNaming.drdNaming.selection.index);
	desc.putBoolean(DEFAULT_SETTINGS.allowSpaces, dlg.funcArea.content.grpNaming.cbNaming.value);
	desc.putInteger(DEFAULT_SETTINGS.letterCase, dlg.funcArea.content.grpLetterCase.drdLetterCase.selection.index);
	desc.putString(DEFAULT_SETTINGS.outputPrefix, dlg.funcArea.content.grpPrefix.editPrefix.text);
	desc.putInteger(DEFAULT_SETTINGS.trim, dlg.funcArea.content.grpTrim.drdTrim.selection.index);
	var cbBgLayer = dlg.funcArea.content.cbBgLayer;
	desc.putBoolean(DEFAULT_SETTINGS.exportBackground, cbBgLayer.value && cbBgLayer.enabled);
	desc.putInteger(DEFAULT_SETTINGS.fileType, dlg.funcArea.content.grpFileType.drdFileType.selection.index);

	desc.putInteger(DEFAULT_SETTINGS.png24.matte, saveOpt[0].controlRoot.matte.selection.index);
	desc.putBoolean(DEFAULT_SETTINGS.png24.transparency, saveOpt[0].controlRoot.transparency.value);
	desc.putBoolean(DEFAULT_SETTINGS.png24.interlaced, saveOpt[0].controlRoot.interlaced.value);

	desc.putInteger(DEFAULT_SETTINGS.png8.colorReduction, saveOpt[1].controlRoot.colourReduction.selection.index);
	desc.putString(DEFAULT_SETTINGS.png8.numberOfColors, saveOpt[1].controlRoot.colorsLast);
	desc.putInteger(DEFAULT_SETTINGS.png8.dither, saveOpt[1].controlRoot.dither.selection.index);
	desc.putInteger(DEFAULT_SETTINGS.png8.ditherAmount, saveOpt[1].controlRoot.ditherAmount.value);
	desc.putBoolean(DEFAULT_SETTINGS.png8.interlaced, saveOpt[1].controlRoot.interlaced.value);
	desc.putBoolean(DEFAULT_SETTINGS.png8.transparency, saveOpt[1].controlRoot.transparency.value);
	desc.putInteger(DEFAULT_SETTINGS.png8.matte, saveOpt[1].controlRoot.matte.selection.index);
	desc.putInteger(DEFAULT_SETTINGS.png8.transparencyDither, saveOpt[1].controlRoot.transparencyDither.selection.index);
	desc.putInteger(DEFAULT_SETTINGS.png8.transparencyDitherAmount, saveOpt[1].controlRoot.transparencyDitherAmount.value);

	desc.putInteger(DEFAULT_SETTINGS.jpg.quality, saveOpt[2].controlRoot.quality.value);
	desc.putInteger(DEFAULT_SETTINGS.jpg.matte, saveOpt[2].controlRoot.matte.selection.index);
	desc.putBoolean(DEFAULT_SETTINGS.jpg.icc, saveOpt[2].controlRoot.icc.value);
	desc.putBoolean(DEFAULT_SETTINGS.jpg.optimized, saveOpt[2].controlRoot.optimised.value);
	desc.putBoolean(DEFAULT_SETTINGS.jpg.progressive, saveOpt[2].controlRoot.progressive.value);

	desc.putBoolean(DEFAULT_SETTINGS.tga.alpha, saveOpt[3].controlRoot.alpha.value);
	desc.putInteger(DEFAULT_SETTINGS.tga.depth, saveOpt[3].controlRoot.bitsPerPixel.selection.index);
	desc.putBoolean(DEFAULT_SETTINGS.tga.rle, saveOpt[3].controlRoot.rle.value);

	desc.putBoolean(DEFAULT_SETTINGS.bmp.alpha, saveOpt[4].controlRoot.alpha.value);
	desc.putInteger(DEFAULT_SETTINGS.bmp.depth, saveOpt[4].controlRoot.depth.selection.index);
	desc.putBoolean(DEFAULT_SETTINGS.bmp.rle, saveOpt[4].controlRoot.rle.value);
	desc.putBoolean(DEFAULT_SETTINGS.bmp.flipRow, saveOpt[4].controlRoot.flipRowOrder.value);

	// Save settings.
	
	// "true" means setting persists across Photoshop launches.
	app.putCustomOptions(USER_SETTINGS_ID, desc, true);
}

function getSettings()
{
	if (!env.cs3OrHigher) {
		return null;
	}
	
	var desc;
	var result = null;
	try {
		// might throw if settings not present (not saved previously)
		desc = app.getCustomOptions(USER_SETTINGS_ID);
		
		// might throw if format changed or got corrupt
		result = {
			exportAll: desc.getBoolean( DEFAULT_SETTINGS.exportAll ), 
			nameFiles: desc.getInteger( DEFAULT_SETTINGS.nameFiles ), 
			allowSpaces: desc.getBoolean( DEFAULT_SETTINGS.allowSpaces ), 
			letterCase: desc.getInteger( DEFAULT_SETTINGS.letterCase ), 
			outputPrefix: desc.getString( DEFAULT_SETTINGS.outputPrefix ),
			trim: desc.getInteger( DEFAULT_SETTINGS.trim ), 
			exportBackground: desc.getBoolean( DEFAULT_SETTINGS.exportBackground ),
			fileType: desc.getInteger( DEFAULT_SETTINGS.fileType ),
			png24: {
				matte:  desc.getInteger(DEFAULT_SETTINGS.png24.matte),
				transparency:  desc.getBoolean(DEFAULT_SETTINGS.png24.transparency),
				interlaced:  desc.getBoolean(DEFAULT_SETTINGS.png24.interlaced)
			},
			png8: {
				colorReduction: desc.getInteger(DEFAULT_SETTINGS.png8.colorReduction),
				numberOfColors: desc.getString(DEFAULT_SETTINGS.png8.numberOfColors),
				dither: desc.getInteger(DEFAULT_SETTINGS.png8.dither),
				ditherAmount: desc.getInteger(DEFAULT_SETTINGS.png8.ditherAmount),
				interlaced: desc.getBoolean(DEFAULT_SETTINGS.png8.interlaced),
				transparency: desc.getBoolean(DEFAULT_SETTINGS.png8.transparency),
				matte: desc.getInteger(DEFAULT_SETTINGS.png8.matte),
				transparencyDither: desc.getInteger(DEFAULT_SETTINGS.png8.transparencyDither),
				transparencyDitherAmount: desc.getInteger(DEFAULT_SETTINGS.png8.transparencyDitherAmount)
			},
			jpg: {
				quality: desc.getInteger(DEFAULT_SETTINGS.jpg.quality),
				matte: desc.getInteger(DEFAULT_SETTINGS.jpg.matte),
				icc: desc.getBoolean(DEFAULT_SETTINGS.jpg.icc),
				optimized: desc.getBoolean(DEFAULT_SETTINGS.jpg.optimized),
				progressive: desc.getBoolean(DEFAULT_SETTINGS.jpg.progressive),
			},
			tga: {
				depth: desc.getInteger(DEFAULT_SETTINGS.tga.depth),
				alpha: desc.getBoolean(DEFAULT_SETTINGS.tga.alpha),
				rle:  desc.getBoolean(DEFAULT_SETTINGS.tga.rle)
			},
			bmp: {
				alpha: desc.getBoolean(DEFAULT_SETTINGS.bmp.alpha),
				rle: desc.getBoolean(DEFAULT_SETTINGS.bmp.rle),
				flipRow: desc.getBoolean(DEFAULT_SETTINGS.bmp.flipRow),
				depth: desc.getInteger(DEFAULT_SETTINGS.bmp.depth)
			}
		};
	}
	catch (e) {
		return null;
	}
	
	return result;
} 

// Clone these two functions to add a new export file format - GUI
function getDialogParamsTarga(parent)
{
	var depth = parent.add("group");
	depth.add("statictext", undefined, "Depth:");
	var bitsPerPixelLabels = ["16 bit", "24 bit", "32 bit"];
	parent.bitsPerPixel = depth.add("dropdownlist", undefined, bitsPerPixelLabels);
	parent.bitsPerPixel.selection = 2;

	parent.alpha = parent.add("checkbox", undefined, "With alpha channel");
	parent.alpha.value = true;

	parent.rle = parent.add("checkbox", undefined, "RLE compression");
	parent.rle.value = true;

	return {type: "TGA", handler: onDialogSelectTarga};
}

// Clone these two functions to add a new export file format - result handler
function onDialogSelectTarga(parent)
{
	prefs.format = "TGA";
	prefs.fileExtension = ".tga";
	prefs.formatArgs = new TargaSaveOptions();
	prefs.formatArgs.alphaChannels = parent.alpha.value;
	prefs.formatArgs.rleCompression = parent.rle.value;
	var resolution_enum = [TargaBitsPerPixels.SIXTEEN, TargaBitsPerPixels.TWENTYFOUR, TargaBitsPerPixels.THIRTYTWO];
	prefs.formatArgs.resolution = resolution_enum[parent.bitsPerPixel.selection.index];
}

function getDialogParamsJPEG(parent)
{
	const ROW_HEIGHT = 16;

	// quality
	var row = parent.add("group");
	var qualityLabel = row.add("statictext", undefined, "Quality:");
	qualityLabel.preferredSize = [40, ROW_HEIGHT];
	parent.quality = row.add("slider", undefined, 12, 0, 12);
	parent.quality.preferredSize = [140, 20];
	var qualityValue = row.add("statictext", undefined, "12");
	qualityValue.preferredSize = [30, ROW_HEIGHT];

	parent.quality.onChanging = function() {
		this.value = Math.round(this.value);
		qualityValue.text = this.value;
	};

	// matte
	row = parent.add("group");
	var matteLabel = row.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [40, ROW_HEIGHT];
	parent.matte = row.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;

	// colour profile
	parent.icc = parent.add("checkbox", undefined, "ICC Profile");

	// optimised
	parent.optimised = parent.add("checkbox", undefined, "Optimized");
	parent.optimised.value = true;

	// progressive
	parent.progressive = parent.add("checkbox", undefined, "Progressive");
	parent.progressive.onClick = function() {
		parent.optimised.enabled = ! this.value;
	};

	return {type: "JPG", handler: onDialogSelectJPEG};
}

function onDialogSelectJPEG(parent)
{
	prefs.format = "JPG";
	prefs.fileExtension = ".jpg";
	prefs.formatArgs = new JPEGSaveOptions();
	const matteValue = [MatteType.WHITE, MatteType.BLACK, MatteType.SEMIGRAY, MatteType.NONE, MatteType.BACKGROUND, MatteType.FOREGROUND];
	with (prefs.formatArgs) {
		quality = parent.quality.value;
		matte = matteValue[parent.matte.selection.index];
		embedColorProfile = parent.icc.value;
		if (parent.progressive.value) {
			formatOptions = FormatOptions.PROGRESSIVE;
			scans = 3;
		}
		else if (parent.optimised.value) {
			formatOptions = FormatOptions.OPTIMIZEDBASELINE;
		}
		else {
			formatOptions = FormatOptions.STANDARDBASELINE;
		}
	}
}

function getDialogParamsPNG24(parent)
{
	const ROW_HEIGHT = 16;

	// matte
	var row = parent.add("group");
	var matteLabel = row.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [40, ROW_HEIGHT];
	parent.matte = row.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;
	parent.matte.enabled = false;

	// transparency
	parent.transparency = parent.add("checkbox", undefined, "Transparency");
	parent.transparency.value = true;

	parent.transparency.onClick = function() {
		parent.matte.enabled = ! this.value;
	};

	// interlaced
	parent.interlaced = parent.add("checkbox", undefined, "Interlaced");

	return {type: "PNG-24", handler: onDialogSelectPNG24};
}

function onDialogSelectPNG24(parent)
{
	prefs.format = "PNG-24";
	prefs.fileExtension = ".png";

	var WHITE = new RGBColor();
	WHITE.red = 255; WHITE.green = 255; WHITE.blue = 255;
	var BLACK = new RGBColor();
	BLACK.red = 0; BLACK.green = 0; BLACK.blue = 0;
	var GRAY = new RGBColor();
	GRAY.red = 127; GRAY.green = 127; GRAY.blue = 127;

	const matteColours = [WHITE, BLACK, GRAY, BLACK, app.backgroundColor.rgb, app.foregroundColor.rgb];

	prefs.formatArgs = new ExportOptionsSaveForWeb();
	with (prefs.formatArgs) {
		format = SaveDocumentType.PNG;
		PNG8 = false;
		interlaced = parent.interlaced.value;
		transparency = parent.transparency.value;
		matteColor = matteColours[parent.matte.selection.index];
	}
}

function getDialogParamsPNG8(parent)
{
	const ROW_HEIGHT = 16;
	const LABEL_WIDTH = 105;

	// color reduction
	var row = parent.add("group");
	var crLabel = row.add("statictext", undefined, "Color reduction:");
	crLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.colourReduction = row.add("dropdownlist", undefined, [
		"Perceptual",
		"Selective",
		"Adaptive",
		"Restrictive (Web)",
		"-",
		"Black & White",
		"Grayscale",
		"Mac OS",
		"Windows"
	]);
	parent.colourReduction.selection = 1;

	// number of colors
	row = parent.add("group");
	var colorsLabel = row.add("statictext", undefined, "Number of colors:");
	colorsLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.colors = row.add("edittext", undefined, "256");
	parent.colors.preferredSize = [70, 18];
	parent.colorsLast = 256;

	parent.colors.onChange = function() {
		var colorNum = parseInt(this.text, 10);
		if (isNaN(colorNum)) {
			colorNum = parent.colorsLast;
		}
		else if (colorNum < 2) {
			colorNum = 2;
		}
		else if (colorNum > 256) {
			colorNum = 256;
		}
		this.text = colorNum;
		parent.colorsLast = colorNum;
	};

	// dither
	row = parent.add("group");
	var ditherLabel = row.add("statictext", undefined, "Dither:");
	ditherLabel.preferredSize = [LABEL_WIDTH, ROW_HEIGHT];
	parent.dither = row.add("dropdownlist", undefined, [
		"None",
		"Diffusion",
		"Pattern",
		"Noise"
	]);
	parent.dither.selection = 0;

	// dither amount
	var ditherAmountGroup = row.add("group");
	parent.ditherAmount = ditherAmountGroup.add("slider", undefined, 100, 0, 100);
	var ditherAmountValue = ditherAmountGroup.add("statictext", undefined, "100%");
	ditherAmountGroup.enabled = false;

	parent.ditherAmount.onChanging = function() {
		this.value = Math.round(this.value);
		ditherAmountValue.text = "" + this.value + "%";
	};

	parent.dither.onChange = function() {
		ditherAmountGroup.enabled = (this.selection == 1);
	};

	// interlaced
	parent.interlaced = parent.add("checkbox", undefined, "Interlaced");

	// transparency
	var transparencyPanel = parent.add("panel", undefined, "Transparency:");
	transparencyPanel.orientation = "column";
	transparencyPanel.alignChildren = "left";
	parent.transparency = transparencyPanel.add("checkbox", undefined, "Enabled");
	parent.transparency.value = true;

	parent.transparency.onClick = function() {
		matteRow.enabled = ! this.value;
		tdRow.enabled = this.value;
	};

	// matte
	var matteRow = transparencyPanel.add("group");
	var matteLabel = matteRow.add("statictext", undefined, "Matte:");
	matteLabel.preferredSize = [LABEL_WIDTH + 8, ROW_HEIGHT];
	parent.matte = matteRow.add("dropdownlist", undefined, ["White", "Black", "Gray", "-", "Background", "Foreground"]);
	parent.matte.selection = 0;
	matteRow.enabled = false;

	// transparency dither
	var tdRow = transparencyPanel.add("group");
	var transDitherLabel = tdRow.add("statictext", undefined, "Transparency dither:");
	transDitherLabel.preferredSize = [LABEL_WIDTH + 8, ROW_HEIGHT];
	parent.transparencyDither = tdRow.add("dropdownlist", undefined, [
		"None",
		"Diffusion",
		"Pattern",
		"Noise"
	]);
	parent.transparencyDither.selection = 0;

	parent.transparencyDither.onChange = function() {
		transDitherAmountGroup.enabled = (this.selection == 1);
	};

	// transparency dither amount
	var transDitherAmountGroup = tdRow.add("group");
	parent.transparencyDitherAmount = transDitherAmountGroup.add("slider", undefined, 100, 0, 100);
	var transDitherAmountValue = transDitherAmountGroup.add("statictext", undefined, "100%");
	transDitherAmountGroup.enabled = false;

	parent.transparencyDitherAmount.onChanging = function() {
		this.value = Math.round(this.value);
		transDitherAmountValue.text = "" + this.value + "%";
	};

	return {type: "PNG-8", handler: onDialogSelectPNG8};
}

function onDialogSelectPNG8(parent)
{
	prefs.format = "PNG-8";
	prefs.fileExtension = ".png";

	const colorReductionType = [
		ColorReductionType.PERCEPTUAL,
		ColorReductionType.SELECTIVE,
		ColorReductionType.ADAPTIVE,
		ColorReductionType.RESTRICTIVE,
		null,
		ColorReductionType.BLACKWHITE,
		ColorReductionType.GRAYSCALE,
		ColorReductionType.MACINTOSH,
		ColorReductionType.WINDOWS
	];
	const ditherType = [
		Dither.NONE,
		Dither.DIFFUSION,
		Dither.PATTERN,
		Dither.NOISE
	];
	var WHITE = new RGBColor();
	WHITE.red = 255; WHITE.green = 255; WHITE.blue = 255;
	var BLACK = new RGBColor();
	BLACK.red = 0; BLACK.green = 0; BLACK.blue = 0;
	var GRAY = new RGBColor();
	GRAY.red = 127; GRAY.green = 127; GRAY.blue = 127;
	const matteColours = [WHITE, BLACK, GRAY, BLACK, app.backgroundColor.rgb, app.foregroundColor.rgb];

	prefs.formatArgs = new ExportOptionsSaveForWeb();
	with (prefs.formatArgs) {
		format = SaveDocumentType.PNG;
		PNG8 = true;
		colorReduction = colorReductionType[parent.colourReduction.selection.index];
		colors = parseInt(parent.colors.text, 10);
		dither = ditherType[parent.dither.selection.index];
		if (dither == Dither.DIFFUSION) {
			ditherAmount = parent.ditherAmount.value;
		}
		interlaced = parent.interlaced.value;
		transparency = parent.transparency.value;
		matteColor = matteColours[parent.matte.selection.index];
		if (transparency) {
			transparencyDither = ditherType[parent.transparencyDither.selection.index];
			if (transparencyDither == Dither.DIFFUSION) {
				transparencyAmount = parent.transparencyDitherAmount.value;
			}
		}
	}
}

function getDialogParamsBMP(parent)
{
	// bit depth
	var depth = parent.add("group");
	depth.add("statictext", undefined, "Depth:");
	var depthLabels = [
		"32 bit",
		"24 bit",
		"RGB 565 (16 bit)",
		"ARGB 1555 (16 bit)",
		"ARGB 4444 (16 bit)"
	];
	parent.depth = depth.add("dropdownlist", undefined, depthLabels);
	parent.depth.selection = 0;

	// alpha
	parent.alpha = parent.add("checkbox", undefined, "With alpha channel");
	parent.alpha.value = true;

	// RLE
	parent.rle = parent.add("checkbox", undefined, "RLE compression");
	parent.rle.value = true;

	// flip row order
	parent.flipRowOrder = parent.add("checkbox", undefined, "Flip row order");
	parent.flipRowOrder.value = false;

	return {type: "BMP", handler: onDialogSelectBMP};
}

function onDialogSelectBMP(parent)
{
	prefs.format = "BMP";
	prefs.fileExtension = ".bmp";
	prefs.formatArgs = new BMPSaveOptions();
	prefs.formatArgs.osType = OperatingSystem.WINDOWS;
	prefs.formatArgs.alphaChannels = parent.alpha.value;
	prefs.formatArgs.rleCompression = parent.rle.value;
	prefs.formatArgs.flipRowOrder = parent.flipRowOrder.value;
	var resolution_enum = [
		BMPDepthType.THIRTYTWO,
		BMPDepthType.TWENTYFOUR,
		BMPDepthType.BMP_R5G6B5,
		BMPDepthType.BMP_A1R5G5B5,
		BMPDepthType.BMP_A4R4G4B4
	];
	prefs.formatArgs.depth = resolution_enum[parent.depth.selection.index];
}


//
// Bootstrapper (version support, getting additional environment settings, error handling...)
//

function bootstrap()
{
	function showError(err) {
		alert(err + ': on line ' + err.line, 'Script Error', true);
	}

	// initialisation of class methods
	defineProfilerMethods();

	// check if there's a document open
	try {
		var doc = app.activeDocument;		// this actually triggers the exception
		if (! doc) {					// this is just for sure if it ever behaves differently in other versions
			throw new Error();
		}
	}
	catch (e) {
		alert("No document is open! Nothing to export.", "Error", true);
		return "cancel";
	}

	try {
		// setup the environment

		env = new Object();

		env.version = parseInt(app.version, 10);

		if (env.version < 9) {
			alert("Photoshop versions before CS2 are not supported!", "Error", true);
			return "cancel";
		}

		env.cs3OrHigher = (env.version >= 10);

		// get script's file name
		if (env.cs3OrHigher) {
			env.scriptFileName = $.fileName;
		}
		else {
			try {
				//throw new Error();		// doesn't provide the file name, at least in CS2
				var illegal = RUNTIME_ERROR;
			}
			catch (e) {
				env.scriptFileName = e.fileName;
			}
		}

		env.scriptFileDirectory = (new File(env.scriptFileName)).parent;

		// run the script itself
		if (env.cs3OrHigher) {
			// suspend history for CS3 or higher
			app.activeDocument.suspendHistory('Export Layers To Files', 'main()');
		}
		else {
			main();
		}

	        if (env.documentCopy) {
	                env.documentCopy.close(SaveOptions.DONOTSAVECHANGES);
	        }
	}
	catch(e) {
		// report errors unless the user cancelled
		if (e.number != 8007) showError(e);
		if (env.documentCopy) {
			env.documentCopy.close(SaveOptions.DONOTSAVECHANGES);
		}
		return "cancel";
	}
}

//
// ActionManager mud
//

// Faster layer collection:
// 	https://forums.adobe.com/message/2666611

function collectLayersAM(progressBarWindow)
{
	var layers = [],
	    visibleLayers = [],
	    groups = [];
	var layerCount = 0;

	var ref = null;
	var desc = null;

	const idOrdn = app.charIDToTypeID("Ordn");

	// Get layer count reported by the active Document object - it never includes the background.
	ref = new ActionReference();
	ref.putEnumerated(app.charIDToTypeID("Dcmn"), app.charIDToTypeID("Ordn"), app.charIDToTypeID("Trgt"));
	desc = app.executeActionGet(ref);
	layerCount = desc.getInteger(app.charIDToTypeID("NmbL"));

	if (layerCount == 0) {
		// This is a flattened image that contains only the background (which is always visible).
		var bg = app.activeDocument.backgroundLayer;
		var layer = {layer: bg, parent: null};
		layers.push(layer);
		visibleLayers.push(layer);
	}
	else {
		// There are more layers that may or may not contain a background. The background is always at 0;
		// other layers are indexed from 1.

		const idLyr = app.charIDToTypeID("Lyr ");
		const idLayerSection = app.stringIDToTypeID("layerSection");
		const idVsbl = app.charIDToTypeID("Vsbl");
		const idNull = app.charIDToTypeID("null");
		const idSlct = app.charIDToTypeID("slct");
		const idMkVs = app.charIDToTypeID("MkVs");

		const FEW_LAYERS = 10;

		// newer PS's freeze or crash on Mac OS X Yosemite
		//if (layerCount <= FEW_LAYERS) {
			// don't show the progress bar UI for only a few layers
			//progressBarWindow = null;
		//}

		if (progressBarWindow) {
			// The layer count is actually + 1 if there's a background present, but it should be no biggie.
			showProgressBar(progressBarWindow, "Collecting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
		}

		// Query current selection.
		/*ref = new ActionReference();
		 ref.putEnumerated(idLyr, idOrdn, app.charIDToTypeID("Trgt"));
		 var selectionDesc = app.executeActionGet(ref);*/

		try {
			// Collect normal layers.
			var visibleInGroup = [true];
			var layerVisible;
			var currentGroup = null;
			var layerSection;
			for (var i = layerCount; i >= 1; --i) {
				// check if it's an art layer (not a group) that can be selected
				ref = new ActionReference();
				ref.putIndex(idLyr, i);
				desc = app.executeActionGet(ref);
				layerVisible = desc.getBoolean(idVsbl);
				layerSection = app.typeIDToStringID(desc.getEnumerationValue(idLayerSection));
				if ((layerSection == "layerSectionContent")
				    || (layerSection == "layerSectionStart")) {
					// select the layer and then retrieve it via Document.activeLayer
					desc.clear();
					desc.putReference(idNull, ref);
					desc.putBoolean(idMkVs, false);
					app.executeAction(idSlct, desc, DialogModes.NO);

					var activeLayer = app.activeDocument.activeLayer;

					if (layerSection == "layerSectionContent") {
						if (! isAdjustmentLayer(activeLayer)) {
							var layer = {layer: activeLayer, parent: currentGroup};
							layers.push(layer);
							if (layerVisible && visibleInGroup[visibleInGroup.length - 1]) {
								visibleLayers.push(layer);
							}
							if (currentGroup) {
								currentGroup.children.push(layer);
							}
						}
					}
					else {
						var group = {layer: activeLayer, parent: currentGroup, children: []};
						if (group.parent == null) {
							groups.push(group);
						}
						else {
							group.parent.children.push(group);
						}
						currentGroup = group;
						visibleInGroup.push(layerVisible && visibleInGroup[visibleInGroup.length - 1]);
					}
				}
				else if (layerSection == "layerSectionEnd") {
					currentGroup = currentGroup.parent;
					visibleInGroup.pop();
				}

				if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
					if (userCancelled) {
						throw new Error("cancel");
					}
				}
			}

			// Collect the background.
			ref = new ActionReference();
			ref.putIndex(idLyr, 0);
			try {
				desc = app.executeActionGet(ref);
				var bg = app.activeDocument.backgroundLayer;
				var layer = {layer: bg, parent: null};
				layers.push(layer);
				if (bg.visible) {
					visibleLayers.push(layer);
				}

				if (progressBarWindow) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
				}
			}
			catch (e) {
				// no background, move on
			}
		}
		catch (e) {
			if (e.message != "cancel") throw e;
		}

		// restore selection (unfortunately CS2 doesn't support multiselection, so only the topmost layer is re-selected)
		/*desc.clear();
		 ref = new ActionReference();
		 const totalLayerCount = selectionDesc.getInteger(app.charIDToTypeID("Cnt "));
		 ref.putIndex(idLyr, selectionDesc.getInteger(app.charIDToTypeID("ItmI")) - (totalLayerCount - layerCount));
		 desc.putReference(idNull, ref);
		 desc.putBoolean(idMkVs, false);
		 app.executeAction(idSlct, desc, DialogModes.NO);*/

		if (progressBarWindow) {
			progressBarWindow.hide();
		}
	}

	return {layers: layers, visibleLayers: visibleLayers, groups: groups};
}

function countLayersAM(progressBarWindow)
{
	var layerCount = 0;
	var preciseLayerCount = 0;
	var visLayerCount = 0;

	var ref = null;
	var desc = null;

	const idOrdn = app.charIDToTypeID("Ordn");

	// Get layer count reported by the active Document object - it never includes the background.
	ref = new ActionReference();
	ref.putEnumerated(app.charIDToTypeID("Dcmn"), app.charIDToTypeID("Ordn"), app.charIDToTypeID("Trgt"));
	desc = app.executeActionGet(ref);
	layerCount = desc.getInteger(app.charIDToTypeID("NmbL"));

	if (layerCount == 0) {
		// This is a flattened image that contains only the background (which is always visible).
		preciseLayerCount = 1;
		visLayerCount = 1;
	}
	else {
		// There are more layers that may or may not contain a background. The background is always at 0;
		// other layers are indexed from 1.

		const idLyr = app.charIDToTypeID("Lyr ");
		const idLayerSection = app.stringIDToTypeID("layerSection");
		const idVsbl = app.charIDToTypeID("Vsbl");
		const idNull = app.charIDToTypeID("null");
		const idSlct = app.charIDToTypeID("slct");
		const idMkVs = app.charIDToTypeID("MkVs");

		const FEW_LAYERS = 10;

		// newer PS's freeze or crash on Mac OS X Yosemite
		//if (layerCount <= FEW_LAYERS) {
			// don't show the progress bar UI for only a few layers
			//progressBarWindow = null;
		//}

		if (progressBarWindow) {
			// The layer count is actually + 1 if there's a background present, but it should be no biggie.
			showProgressBar(progressBarWindow, "Counting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
		}

		try {
			// Collect normal layers.
			var visibleInGroup = [true];
			var layerVisible;
			var layerSection;
			for (var i = layerCount; i >= 1; --i) {
				// check if it's an art layer (not a group) that can be selected
				ref = new ActionReference();
				ref.putIndex(idLyr, i);
				desc = app.executeActionGet(ref);
				layerVisible = desc.getBoolean(idVsbl);
				layerSection = app.typeIDToStringID(desc.getEnumerationValue(idLayerSection));
				if (layerSection == "layerSectionContent") {
					preciseLayerCount++;
					if (layerVisible && visibleInGroup[visibleInGroup.length - 1]) {
						visLayerCount++;
					}
				}
				else if (layerSection == "layerSectionStart") {
					visibleInGroup.push(layerVisible && visibleInGroup[visibleInGroup.length - 1]);
				}
				else if (layerSection == "layerSectionEnd") {
					visibleInGroup.pop();
				}

				if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
					if (userCancelled) {
						throw new Error("cancel");
					}
				}
			}

			// Collect the background.
			try {
				var bg = app.activeDocument.backgroundLayer;
				preciseLayerCount++;
				if (bg.visible) {
					visLayerCount++;
				}

				if (progressBarWindow) {
					updateProgressBar(progressBarWindow);
					repaintProgressBar(progressBarWindow);
				}
			}
			catch (e) {
				// no background, move on
			}
		}
		catch (e) {
			if (e.message != "cancel") throw e;
		}

		if (progressBarWindow) {
			progressBarWindow.hide();
		}
	}

	return {layerCount: preciseLayerCount, visibleLayerCount: visLayerCount};
}

function exportPng24AM(fileName, options)
{
	var desc = new ActionDescriptor(),
	    desc2 = new ActionDescriptor();
	desc2.putEnumerated(app.charIDToTypeID("Op  "), app.charIDToTypeID("SWOp"), app.charIDToTypeID("OpSa"));
	desc2.putEnumerated(app.charIDToTypeID("Fmt "), app.charIDToTypeID("IRFm"), app.charIDToTypeID("PN24"));
	desc2.putBoolean(app.charIDToTypeID("Intr"), options.interlaced);
	desc2.putBoolean(app.charIDToTypeID("Trns"), options.transparency);
	desc2.putBoolean(app.charIDToTypeID("Mtt "), true);
	desc2.putInteger(app.charIDToTypeID("MttR"), options.matteColor.red);
	desc2.putInteger(app.charIDToTypeID("MttG"), options.matteColor.green);
	desc2.putInteger(app.charIDToTypeID("MttB"), options.matteColor.blue);
	desc2.putBoolean(app.charIDToTypeID("SHTM"), false);
	desc2.putBoolean(app.charIDToTypeID("SImg"), true);
	desc2.putBoolean(app.charIDToTypeID("SSSO"), false);
	desc2.putList(app.charIDToTypeID("SSLt"), new ActionList());
	desc2.putBoolean(app.charIDToTypeID("DIDr"), false);
	desc2.putPath(app.charIDToTypeID("In  "), new File(fileName));
	desc.putObject(app.charIDToTypeID("Usng"), app.stringIDToTypeID("SaveForWeb"), desc2);
	app.executeAction(app.charIDToTypeID("Expr"), desc, DialogModes.NO);
}

function exportPng8AM(fileName, options)
{
	var id5 = app.charIDToTypeID( "Expr" );
	var desc3 = new ActionDescriptor();
	var id6 = app.charIDToTypeID( "Usng" );
	var desc4 = new ActionDescriptor();
	var id7 = app.charIDToTypeID( "Op  " );
	var id8 = app.charIDToTypeID( "SWOp" );
	var id9 = app.charIDToTypeID( "OpSa" );
	desc4.putEnumerated( id7, id8, id9 );
	var id10 = app.charIDToTypeID( "Fmt " );
	var id11 = app.charIDToTypeID( "IRFm" );
	var id12 = app.charIDToTypeID( "PNG8" );
	desc4.putEnumerated( id10, id11, id12 );
	var id13 = app.charIDToTypeID( "Intr" ); //Interlaced
	desc4.putBoolean( id13, options.interlaced );
	var id14 = app.charIDToTypeID( "RedA" );
	var id15 = app.charIDToTypeID( "IRRd" );
	//Algorithm
	var id16;
	switch (options.colorReduction) {

	case ColorReductionType.PERCEPTUAL:
		id16 = app.charIDToTypeID( "Prcp" );
		break;

	case ColorReductionType.SELECTIVE:
		id16 = app.charIDToTypeID( "Sltv" );
		break;

	case ColorReductionType.ADAPTIVE:
		id16 = app.charIDToTypeID( "Adpt" );
		break;

	case ColorReductionType.RESTRICTIVE:
		id16 = app.charIDToTypeID( "Web " );
		break;

	        // CUSTOM not supported

	case ColorReductionType.BLACKWHITE:
	case ColorReductionType.GRAYSCALE:
	case ColorReductionType.MACINTOSH:
	case ColorReductionType.WINDOWS:
		id16 = app.charIDToTypeID( "FlBs" );
		break;

	default:
		throw new Error("Unknown color reduction algorithm. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id14, id15, id16 );
	var id361 = app.charIDToTypeID( "FBPl" );
	switch (options.colorReduction) {

	case ColorReductionType.BLACKWHITE:
		desc4.putString( id361, "Black & White" );
		break;

	case ColorReductionType.GRAYSCALE:
		desc4.putString( id361, "Grayscale" );
		break;

	case ColorReductionType.MACINTOSH:
		desc4.putString( id361, "Mac OS" );
		break;

	case ColorReductionType.WINDOWS:
		desc4.putString( id361, "Windows" );
		break;
	}
	var id17 = app.charIDToTypeID( "RChT" );
	desc4.putBoolean( id17, false );
	var id18 = app.charIDToTypeID( "RChV" );
	desc4.putBoolean( id18, false );
	var id19 = app.charIDToTypeID( "AuRd" );
	desc4.putBoolean( id19, false );
	var id20 = app.charIDToTypeID( "NCol" ); //NO. Of Colors
	desc4.putInteger( id20, options.colors );
	var id21 = app.charIDToTypeID( "Dthr" ); //Dither
	var id22 = app.charIDToTypeID( "IRDt" );
	//Dither type
	var id23;
	switch (options.dither) {

	case Dither.NONE:
		id23 = app.charIDToTypeID( "None" );
		break;

	case Dither.DIFFUSION:
		id23 = app.charIDToTypeID( "Dfsn" );
		break;

	case Dither.PATTERN:
		id23 = app.charIDToTypeID( "Ptrn" );
		break;

	case Dither.NOISE:
		id23 = app.charIDToTypeID( "BNoi" );
		break;

	default:
		throw new Error("Unknown dither type. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id21, id22, id23 );
	var id24 = app.charIDToTypeID( "DthA" );
	desc4.putInteger( id24, options.ditherAmount );
	var id25 = app.charIDToTypeID( "DChS" );
	desc4.putInteger( id25, 0 );
	var id26 = app.charIDToTypeID( "DCUI" );
	desc4.putInteger( id26, 0 );
	var id27 = app.charIDToTypeID( "DChT" );
	desc4.putBoolean( id27, false );
	var id28 = app.charIDToTypeID( "DChV" );
	desc4.putBoolean( id28, false );
	var id29 = app.charIDToTypeID( "WebS" );
	desc4.putInteger( id29, 0 );
	var id30 = app.charIDToTypeID( "TDth" ); //transparency dither
	var id31 = app.charIDToTypeID( "IRDt" );
	var id32;
	switch (options.transparencyDither) {

	case Dither.NONE:
		id32 = app.charIDToTypeID( "None" );
		break;

	case Dither.DIFFUSION:
		id32 = app.charIDToTypeID( "Dfsn" );
		break;

	case Dither.PATTERN:
		id32 = app.charIDToTypeID( "Ptrn" );
		break;

	case Dither.NOISE:
		id32 = app.charIDToTypeID( "BNoi" );
		break;

	default:
		throw new Error("Unknown transparency dither algorithm. Cannot export PNG-8!");
	}
	desc4.putEnumerated( id30, id31, id32 );
	var id33 = app.charIDToTypeID( "TDtA" );
	desc4.putInteger( id33, options.transparencyAmount );
	var id34 = app.charIDToTypeID( "Trns" ); //Transparency
	desc4.putBoolean( id34, options.transparency );
	var id35 = app.charIDToTypeID( "Mtt " );
	desc4.putBoolean( id35, true );		 //matte
	var id36 = app.charIDToTypeID( "MttR" ); //matte color
	desc4.putInteger( id36, options.matteColor.red );
	var id37 = app.charIDToTypeID( "MttG" );
	desc4.putInteger( id37, options.matteColor.green );
	var id38 = app.charIDToTypeID( "MttB" );
	desc4.putInteger( id38, options.matteColor.blue );
	var id39 = app.charIDToTypeID( "SHTM" );
	desc4.putBoolean( id39, false );
	var id40 = app.charIDToTypeID( "SImg" );
	desc4.putBoolean( id40, true );
	var id41 = app.charIDToTypeID( "SSSO" );
	desc4.putBoolean( id41, false );
	var id42 = app.charIDToTypeID( "SSLt" );
	var list1 = new ActionList();
	desc4.putList( id42, list1 );
	var id43 = app.charIDToTypeID( "DIDr" );
	desc4.putBoolean( id43, false );
	var id44 = app.charIDToTypeID( "In  " );
	desc4.putPath( id44, new File(fileName) );
	var id45 = app.stringIDToTypeID( "SaveForWeb" );
	desc3.putObject( id6, id45, desc4 );
	app.executeAction( id5, desc3, DialogModes.NO );
}

//
// Utilities
//

function padder(input, padLength)
{
	// pad the input with zeroes up to indicated length
	var result = (new Array(padLength + 1 - input.toString().length)).join('0') + input;
	return result;
}

function makeValidFileName(fileName, replaceSpaces)
{
	var validName = fileName.replace(/^\s+|\s+$/gm, '');	// trim spaces
	validName = validName.replace(/[\\\*\/\?:"\|<>]/g, ''); // remove characters not allowed in a file name
	if (replaceSpaces) {
		validName = validName.replace(/[ ]/g, '_');			// replace spaces with underscores, since some programs still may have troubles with them
	}
	return validName;
}

function formatString(text)
{
	var args = Array.prototype.slice.call(arguments, 1);
	return text.replace(/\{(\d+)\}/g, function(match, number) {
		return (typeof args[number] != 'undefined') ? args[number] : match;
	});
}

function loadResource(file)
{
	var rsrcString;
	if (! file.exists) {
		alert("Resource file '" + file.name + "' for the export dialog is missing! Please, download the rest of the files that come with this script.", "Error", true);
		return false;
	}
	try {
		file.open("r");
		if (file.error) throw file.error;
		rsrcString = file.read();
		if (file.error) throw file.error;
		if (! file.close()) {
			throw file.error;
		}
	}
	catch (error) {
		alert("Failed to read the resource file '" + file.name + "'!\n\nReason: " + error + "\n\nPlease, check it's available for reading and redownload it in case it became corrupted.", "Error", true);
		return false;
	}

	return rsrcString;
}

function Profiler(enabled)
{
	this.enabled = enabled;
	if (this.enabled) {
		this.startTime = new Date();
		this.lastTime = this.startTime;
	}
}

function defineProfilerMethods()
{
	Profiler.prototype.getDuration = function(rememberAsLastCall, sinceLastCall)
	{
		if (this.enabled) {
			var currentTime = new Date();
			var lastTime = sinceLastCall ? this.lastTime : this.startTime;
			if (rememberAsLastCall) {
				this.lastTime = currentTime;
			}
			return new Date(currentTime.getTime() - lastTime.getTime());
		}
	}

	Profiler.prototype.resetLastTime = function()
	{
		this.lastTime = new Date();
	};

	Profiler.prototype.format = function(duration)
	{
		var output = padder(duration.getUTCHours(), 2) + ":";
		output += padder(duration.getUTCMinutes(), 2) + ":";
		output += padder(duration.getUTCSeconds(), 2) + ".";
		output += padder(duration.getUTCMilliseconds(), 3);
		return output;
	};
}
