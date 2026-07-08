var gulp = require("gulp");
const crypto = require("crypto");
var ts = require("gulp-typescript");
var concat = require("gulp-concat");
var uglify = require("gulp-terser");
var cleanCSS = require("gulp-clean-css");
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
    __BUILD_MOD__: `${buidMode}  ${HASHVALUE || ""}`,
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

  console.log("global_defs",global_defs)
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
      // 确保 www/js 目录存在
      if (!fs.existsSync('./www/js')) {
        fs.mkdirSync('./www/js', { recursive: true });
        console.log("Created www/js directory");
      }
      cb();
    });
  } catch (error) {
    console.log(error);
    cb();
  }

}
gulp.task("clear", clean);

gulp.task("combinejs", async function (cb) {
  // fs.renameSync("www/js/wasm_gzip_bg.wasm", "www/js/tool_bg.wasm");
  const files = fs.readdirSync("./tmp").filter(f => f.endsWith(".js") && f !== "index.js");
  console.log("Files to combine:", files);
  if (files.length === 0) {
    console.log("WARNING: No JS files found in tmp/ to combine!");
    cb();
    return;
  }
  return gulp
    .src(["./tmp/*.js", "!./tmp/index.js"])
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

gulp.task("checkFiles", async function (cb) {
  console.log("tmp/ contents:", fs.readdirSync("./tmp"));
  console.log("www/js/ contents:", fs.existsSync("./www/js") ? fs.readdirSync("./www/js") : "directory does not exist");
  cb();
});

gulp.task("inlineHtml", function (cb) {
  try {
    const htmlPath = "./www/index.html";
    const cssPath = "./www/css/style.min.css";
    const toolJsPath = "./www/js/tool.js";
    const indexJsPath = "./www/js/index.js";

    let html = fs.readFileSync(htmlPath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const toolJs = fs.readFileSync(toolJsPath, "utf8");
    const indexJs = fs.readFileSync(indexJsPath, "utf8");

    html = html.replace(
      /<link\s+rel="stylesheet"\s+type="text\/css"\s+href="css\/style\.min\.css"\s*\/>/,
      `<style>\n${css}\n</style>`
    );
    html = html.replace(
      /<script\s+type="module"\s+src="js\/tool\.js"><\/script>/,
      `<script type="module">\n${toolJs}\n</script>`
    );
    html = html.replace(
      /<script\s+type="module"\s+src="js\/index\.js"><\/script>/,
      `<script type="module">\n${indexJs}\n</script>`
    );

    fs.writeFileSync(htmlPath, html);
    cb();
  } catch (error) {
    cb(error);
  }
});
gulp.task("removetest", function (cb) {
  fs.unlink("./tmp/test.js", () => {
    cb();
  });
});

gulp.task("cssmin", function () {
  return gulp
    .src("css/*.css")
    .pipe(cleanCSS())
    .pipe(rename({ suffix: ".min" }))
    .pipe(gulp.dest("www/css/"));
});

gulp.task("genReadMe", function (cb) {
  let htmlBody = MdConverter.makeHtml (fs.readFileSync("./README.md").toString());
  let html = `
  <html>
  <style>
${fs.readFileSync("./css/readme.css").toString()}
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

  console.log('HASHVALUE',HASHVALUE)
  try {
    let commit = fs.readFileSync('hash.txt').toString()
    HASHVALUE = `cmt: ${commit.trim()} hash: ${HASHVALUE}`;
  } catch (error) {
    
  }

  
  console.log('HASHVALUE',HASHVALUE)
  cb();
});

gulp.task("hash", gulp.series(["genHashFile", "calHash"]));

gulp.task("copytemplate", function (cb) {
  try {
    fs.copyFileSync("./src/html/index.html", "./www/index.html");
    fs.copyFileSync("./src/html/fmt.html", "./www/fmt.html");
    console.log("Copied templates from src/html/ to www/");
    cb();
  } catch (error) {
    console.error("Error copying template:", error);
    cb(error);
  }
});

gulp.task("wait", function (cb) {
  setTimeout(cb, 5000);
});

gulp.task(
  "dev",
  gulp.series([
    "clear",
    "genReadMe",
    "cssmin",
    "copystatic",
    "build",
    "copytemplate",
    "hash",
    "combinejs",
    "indexjs",
    "inlineHtml",
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
    "copytemplate",
    "hash",
    "checkFiles",
    "combinejs",
    "checkFiles",
    "indexjs",
    "wait",
    "inlineHtml",
  ])
);
