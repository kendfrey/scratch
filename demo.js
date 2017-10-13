require(["dist/scratch"], ({ Context, Stroke, hsl }) =>
{
const select = document.querySelector("select");
const code = document.querySelector("pre");
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

select.onchange = update;

select.value = location.hash.substr(1);
if (select.selectedIndex < 0)
{
	select.selectedIndex = 0;
}

update();

function update()
{
	if (select.selectedIndex < 0)
	{
		return;
	}
	const script = select.selectedOptions[0].querySelector("template").content.textContent.trim();
	code.textContent = script;
	location.hash = select.value;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const context = new Context();
	eval(script);
	context.draw(ctx);
}
});
