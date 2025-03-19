var gulp = require("gulp");
const crypto = require("crypto");
var ts = require("gulp-typescript");
var concat = require("gulp-concat");
var uglify = require("gulp-terser");
var cssmin = require("gulp-cssmin");
var rename = require("gulp-rename");


var showdown  = require('showdown')
var MdConverter = new showdown.Converter({tables:true,strikethrough:true })

var tsProject = ts.createProject("tsconfig.json");
const fs = require("fs");

const buidTime = new Date().toISOString();
const buidMode = process.argv[2] === "dis" ? "Release" : "DEBUG";
var HASHVALUE = "--";



function beijingtime() {
  return new Date(Date.now() + 3600000 * 8)
    .toISOString()
    .replace("T", " ")
    .replace("Z", " +0800");
}

function getugliyconfig() {
  const global_defs = {
    __BUILD_TIME__: beijingtime(),
    __BUILD_MOD__: `${buidMode}-${HASHVALUE || ""}`,
  };

  const ugliyconfigDebug = {
    mangle: false,
    output: {
      beautify: true,
      comments: "all",
      // ascii_only:true
    },
    compress: {
      // defaults:false,
      // dead_code:true,
      // conditionals:true,
      global_defs: {
        __DEBUG__: true,
        ...global_defs,
      },
    },
  };

  const ugliyconfigRelease = {
    mangle: false,
    output: {
      beautify: true,
      ascii_only: true,
    },
    compress: {
      defaults: true,
      dead_code: true,
      conditionals: true,
      global_defs: {
        __DEBUG__: false,
        ...global_defs,
      },
      pure_funcs: ["console.log"],
    },
  };

  var ugliyconfig =
    process.argv[2] == "dev" ? ugliyconfigDebug : ugliyconfigRelease;

  return ugliyconfig;
}

gulp.task("build", function () {
  return tsProject.src().pipe(tsProject()).pipe(gulp.dest("tmp"));
});
gulp.task("cpjs", function () {
  return gulp.src("./static/*.js").pipe(gulp.dest("tmp"));
});
gulp.task("cpfile", function () {
  return gulp.src("./static/*.wasm").pipe(gulp.dest("www/js"));
});

gulp.task("copystatic", gulp.parallel(["cpfile", "cpjs"]));
function clean(cb) {
  let rm = fs.rm ? fs.rm : fs.rmdir;
  console.log("clean",rm);
  try {
    rm("./tmp", () => {
      console.log("clean3");
      rm("./www/js", (e) => {
        console.log("clean3333");
        console.log(e);
        cb();
      });
    });
  } catch (error) {
    console.log(error);
  }
  
}
gulp.task("clear", clean);

gulp.task("combinejs", async function (cb) {
  // fs.renameSync("www/js/wasm_gzip_bg.wasm", "www/js/tool_bg.wasm");
  return gulp
    .src(["./tmp/!(index).js"])
    .pipe(concat("tool.js"))
    .pipe(uglify(getugliyconfig()))
    .pipe(gulp.dest("www/js"));
});

gulp.task("indexjs", async function (cb) {
  return gulp
    .src(["./tmp/index.js"])
    .pipe(uglify(getugliyconfig()))
    .pipe(gulp.dest("www/js"));
});
gulp.task("removetest", function (cb) {
  fs.unlink("./tmp/test.js", () => {
    cb();
  });
});

gulp.task("cssmin", function () {
  return gulp
    .src("css/*.css")
    .pipe(cssmin())
    .pipe(rename({ suffix: ".min" }))
    .pipe(gulp.dest("www/css/"));
});

gulp.task("genReadMe", function (cb) {
  let htmlBody = MdConverter.makeHtml (fs.readFileSync("./README.md").toString());
  let html = `
  <html>
  <style>
${fs.readFileSync("./www/css/readme.min.css").toString()}
  </style>
${htmlBody}

  `
  fs.writeFileSync("./www/README.html", html);
  cb();

   
});

gulp.task("genHashFile", function () {
  var files = fs.readdirSync("tmp");
  files = files.sort((a, b) => {
    return a < b ? -1 : a > b ? 1 : 0;
  });

  files = files.map((e) => {
    if (/.*js$/.test(e) || /.*wasm$/.test(e)) {
      return "tmp/" + e;
    }
  }).filter(e=>e);
  // files.push("static/wasm_gzip_bg.wasm");
  files.push("www/index.html");
  console.log(files)
  return gulp.src(files).pipe(concat("md5")).pipe(gulp.dest("tmp"));
});

gulp.task("calHash", function (cb) {
  let md5file = fs.readFileSync("tmp/md5");

  let sha256 = crypto.createHash("sha256");
  let b64 = sha256.update(md5file).digest("binary");
  sha256 = crypto.createHash("sha256");
  HASHVALUE = sha256.update(b64).digest("hex").substring(0,8);

  cb();
});

gulp.task("hash", gulp.series(["genHashFile", "calHash"]));

gulp.task(
  "dev",
  gulp.series([
    "clear",
    "genReadMe",
    "cssmin",
    "copystatic",
    "build",
    "hash",
    "combinejs",
    "indexjs",
  ])
);

gulp.task(
  "dis",
  gulp.series([
    "clear",
    "genReadMe",
    "cssmin",
    "copystatic",
    "build",
    "removetest",
    "hash",
    "combinejs",
    "indexjs",
  ])
);
